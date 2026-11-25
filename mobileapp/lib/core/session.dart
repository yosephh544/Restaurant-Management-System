import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';
import 'models.dart';
import 'profile.dart';

// Developer controls are compiled out of profile and release builds.
const developmentToolsEnabled = kDebugMode;
const temporaryQuickLoginEnabled = developmentToolsEnabled;

abstract class Vault {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class SecureVault implements Vault {
  final FlutterSecureStorage storage = const FlutterSecureStorage(
      aOptions: AndroidOptions(encryptedSharedPreferences: true));
  @override
  Future<String?> read(String key) => storage.read(key: key);
  @override
  Future<void> write(String key, String value) =>
      storage.write(key: key, value: value);
  @override
  Future<void> delete(String key) => storage.delete(key: key);
}

class LocalWorkspace {
  final Vault vault;
  final String scope;
  Future<void> _writes = Future.value();
  bool active = true;
  final Map<String, PaymentSession> _memorySessions = {};
  LocalWorkspace(this.vault, String server, String userId)
      : scope = Uri.encodeComponent('$server/$userId');
  String get draftKey => 'draft/$scope';
  String get sessionsKey => 'sessions/$scope';
  Future<void> _save(String key, Object value) {
    if (!active) return Future.value();
    final result = _writes.then((_) =>
        active ? vault.write(key, jsonEncode(value)) : Future<void>.value());
    _writes = result.catchError((Object _) {});
    return result;
  }

  Future<Json?> draft() async {
    final raw = await vault.read(draftKey);
    return raw == null ? null : jsonObject(jsonDecode(raw));
  }

  Future<void> saveDraft(Json value) => _save(draftKey, value);
  Future<void> clearDraft() async {
    await _writes;
    await vault.delete(draftKey);
  }

  Future<List<PaymentSession>> sessions() async {
    await _writes;
    final raw = await vault.read(sessionsKey);
    final saved = raw == null
        ? <PaymentSession>[]
        : (jsonDecode(raw) as List)
            .map((v) => PaymentSession.fromJson(jsonObject(v)))
            .toList();
    final merged = {for (final p in saved) p.id: p, ..._memorySessions};
    return merged.values.toList()
      ..sort((a, b) => b.created.compareTo(a.created));
  }

  Future<void> saveSession(PaymentSession payment) async {
    if (!active) return;
    _memorySessions[payment.id] = payment;
    // Serialize the read and write together to preserve simultaneous session updates.
    final result = _writes.then((_) async {
      if (!active) return;
      final raw = await vault.read(sessionsKey);
      final list = raw == null
          ? <Json>[]
          : (jsonDecode(raw) as List).map(jsonObject).toList();
      list.removeWhere((j) => j['id'] == payment.id);
      list.insert(0, payment.toJson());
      await vault.write(sessionsKey, jsonEncode(list));
    });
    _writes = result.catchError((Object _) {});
    await result;
  }

  Future<void> close() async {
    active = false;
    await _writes;
    _memorySessions.clear();
    await vault.delete(draftKey);
    await vault.delete(sessionsKey);
  }
}

class SessionState {
  final Session? session;
  final String? message;
  final bool ready;
  const SessionState({this.session, this.message, this.ready = false});
}

final preferencesProvider = Provider<SharedPreferences>(
    (ref) => throw UnimplementedError('Preferences must be initialized.'));
final vaultProvider = Provider<Vault>((ref) => SecureVault());
const defaultServer = String.fromEnvironment('API_BASE_URL',
    defaultValue: kDebugMode ? 'http://196.190.251.194:6066/api/v1' : '');
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(
    developmentToolsEnabled
        ? ref.read(preferencesProvider).getString('server') ?? defaultServer
        : defaultServer));
final restaurantApiProvider = Provider<RestaurantApi>(
    (ref) => RestaurantApi(ref.read(apiClientProvider)));
final stationQueueRevisionProvider = StateProvider<int>((ref) => 0);
final paymentFlowActiveProvider = StateProvider<bool>((ref) => false);
final sessionProvider =
    StateNotifierProvider<SessionController, SessionState>((ref) {
  final controller = SessionController(ref.read(apiClientProvider),
      ref.read(vaultProvider), ref.read(preferencesProvider));
  unawaited(controller.restore());
  return controller;
});

class SessionController extends StateNotifier<SessionState> {
  static const _quickLoginKey = 'temporary_quick_login';
  final ApiClient api;
  final Vault vault;
  final SharedPreferences preferences;
  Future<bool>? _refreshing;
  Future<void> _authWrites = Future.value();
  LocalWorkspace? workspace;
  int _generation = 0;
  bool _signingOut = false;
  SessionController(this.api, this.vault, this.preferences)
      : super(const SessionState()) {
    api.token = () => state.session?.accessToken;
    api.refresh = refresh;
    api.expired = () => unawaited(signOut(
        remote: false,
        message: api.authFailureMessage ??
            'Your session expired. Please sign in again.'));
  }
  String get server => api.dio.options.baseUrl.replaceFirst(RegExp(r'/$'), '');
  Future<void> _accept(Session value, {bool persist = true}) async {
    if (!mounted || _signingOut) return;
    final generation = _generation;
    if (persist) {
      final write = _authWrites.then((_) => vault.write(
          'session', jsonEncode({'server': server, ...value.toJson()})));
      _authWrites = write.catchError((Object _) {});
      await write;
    }
    if (!mounted || _signingOut || generation != _generation) return;
    workspace ??= LocalWorkspace(vault, server, value.staff.id);
    state = SessionState(session: value, ready: true);
  }

  Future<void> restore() async {
    final generation = _generation;
    try {
      if (!temporaryQuickLoginEnabled) await forgetQuickLogin();
      normalizeServer(server, allowHttp: !kReleaseMode);
      final raw = await vault.read('session');
      if (!mounted || generation != _generation) return;
      if (raw != null) {
        final j = jsonObject(jsonDecode(raw));
        if (j['server'] == server) {
          await _accept(Session.fromJson(j), persist: false);
          await revalidate();
          return;
        }
        await vault.delete('session');
      }
    } catch (_) {
      // A network failure keeps an already restored session; unreadable storage does not.
    }
    if (mounted && generation == _generation) {
      state = SessionState(session: state.session, ready: true);
    }
  }

  Future<List<Json>> _quickLoginAccounts() async {
    if (!temporaryQuickLoginEnabled) return [];
    final configuredServer = server;
    final raw = await vault.read(_quickLoginKey);
    if (raw == null || configuredServer != server) return [];
    try {
      final stored = jsonObject(jsonDecode(raw));
      if (stored['server'] != server) return [];
      // Preserve an account saved by the earlier single-account shortcut.
      final entries = stored.containsKey('accounts')
          ? stored['accounts'] as List
          : [stored];
      final accounts = <String, Json>{};
      for (final entry in entries) {
        if (entry is! Map) continue;
        final account = jsonObject(entry);
        if (account['username'] is! String || account['pin'] is! String) {
          continue;
        }
        final username = (account['username'] as String).trim().toLowerCase();
        if (username.isEmpty ||
            username.length > 50 ||
            !RegExp(r'^\d{4,6}$').hasMatch(account['pin'] as String)) {
          continue;
        }
        accounts[username] = {
          'username': username,
          'pin': account['pin'],
          'id': account['id'] is String ? account['id'] : '',
          'name': account['name'] is String ? account['name'] : '',
          'role': account['role'] is String ? account['role'] : '',
        };
      }
      return accounts.values.toList();
    } on FormatException {
      return [];
    } on TypeError {
      return [];
    }
  }

  Future<List<Json>> quickLoginAccounts() async => (await _quickLoginAccounts())
      .map((account) => <String, dynamic>{
            'username': account['username'],
            'name': account['name'],
            'role': account['role'],
          })
      .toList();

  Future<void> forgetQuickLogin({String? username}) {
    final configuredServer = server;
    final write = _authWrites.then((_) async {
      if (username == null) {
        await vault.delete(_quickLoginKey);
        return;
      }
      if (configuredServer != server) return;
      final accounts = await _quickLoginAccounts();
      accounts.removeWhere(
          (account) => account['username'] == username.trim().toLowerCase());
      if (configuredServer != server) return;
      if (accounts.isEmpty) {
        await vault.delete(_quickLoginKey);
      } else {
        await vault.write(
            _quickLoginKey,
            jsonEncode({
              'server': configuredServer,
              'accounts': accounts,
            }));
      }
    });
    _authWrites = write.catchError((Object _) {});
    return write;
  }

  Future<void> quickLogin(String username) async {
    if (!temporaryQuickLoginEnabled) {
      throw const ApiException(
          'Quick sign-in is available only for development.');
    }
    final accounts = await _quickLoginAccounts();
    final matches = accounts.where(
        (account) => account['username'] == username.trim().toLowerCase());
    if (matches.isEmpty) {
      throw const ApiException('Add this quick sign-in account first.');
    }
    final account = matches.first;
    try {
      await login(account['username'] as String, account['pin'] as String);
    } on ApiException catch (e) {
      if (e.status == 401) await forgetQuickLogin(username: username);
      rethrow;
    }
  }

  Future<Session> _authenticate(String username, String pin) async {
    if (_signingOut) {
      throw const ApiException(
          'Sign-out is still completing. Please try again in a moment.');
    }
    if (!RegExp(r'^\d{4,6}$').hasMatch(pin)) {
      throw const ApiException('Enter a 4–6 digit PIN.');
    }
    api.authFailureMessage = null;
    final configuredServer = server;
    if (configuredServer.isEmpty) {
      throw const ApiException(
          'The app is not configured. Ask your manager for help.');
    }
    normalizeServer(configuredServer, allowHttp: !kReleaseMode);
    final tokens = await api.data('POST', 'auth/pin-login',
        public: true, body: {'username': username.trim(), 'pin': pin});
    if (configuredServer != server) {
      throw const ApiException('The restaurant server changed. Sign in again.');
    }
    final staff = await decodeStaffProfile(
        await api.data('GET', 'auth/me',
            bearerToken: tokens['accessToken'] as String),
        username: username.trim());
    final value = Session.fromTokens(tokens, staff);
    if (!value.staff.active) {
      throw const ApiException(
          'This staff account is inactive. Contact your manager.');
    }
    return value;
  }

  Future<void> _saveQuickLoginAccount(Session value, String username,
      String pin, String configuredServer, int generation) async {
    if (!value.staff.supported) {
      throw const ApiException(
          'Choose a waiter, kitchen, bartender or cashier account.');
    }
    final write = _authWrites.then((_) async {
      if (!mounted ||
          _signingOut ||
          generation != _generation ||
          configuredServer != server) {
        return;
      }
      final accounts = await _quickLoginAccounts();
      if (!mounted ||
          _signingOut ||
          generation != _generation ||
          configuredServer != server) {
        return;
      }
      final canonical = username.trim().toLowerCase();
      final account = <String, dynamic>{
        'username': canonical,
        'pin': pin,
        'id': value.staff.id,
        'name': value.staff.name,
        'role': value.staff.role,
      };
      final index = accounts.indexWhere((existing) =>
          existing['username'] == canonical ||
          existing['id'] == value.staff.id);
      if (index < 0) {
        accounts.add(account);
      } else {
        accounts[index] = account;
      }
      await vault.write(
          _quickLoginKey,
          jsonEncode({
            'server': configuredServer,
            'accounts': accounts,
          }));
    });
    _authWrites = write.catchError((Object _) {});
    await write;
  }

  Future<void> addQuickLoginAccount(String username, String pin) async {
    if (!temporaryQuickLoginEnabled) {
      throw const ApiException(
          'Quick sign-in is available only for development.');
    }
    final generation = _generation;
    final configuredServer = server;
    final value = await _authenticate(username, pin);
    try {
      if (!mounted || generation != _generation || configuredServer != server) {
        throw const ApiException(
            'The restaurant server changed. Add the account again.');
      }
      await _saveQuickLoginAccount(
          value, username, pin, configuredServer, generation);
    } finally {
      // Account setup does not accept a session; revoke its verification tokens.
      try {
        await api.dio.post<dynamic>('$configuredServer/auth/logout',
            data: {'refreshToken': value.refreshToken},
            options: Options(
                headers: {'Authorization': 'Bearer ${value.accessToken}'}));
      } catch (_) {
        // The credentials remain configured if the cleanup server is unreachable.
      }
    }
  }

  Future<void> login(String username, String pin) async {
    final generation = _generation;
    final value = await _authenticate(username, pin);
    if (!mounted || generation != _generation) return;
    await _accept(value);
  }

  Future<bool> refresh() =>
      _refreshing ??= _refresh().whenComplete(() => _refreshing = null);
  Future<bool> _refresh() async {
    if (!mounted) return false;
    final old = state.session;
    final generation = _generation;
    if (old == null || _signingOut) return false;
    api.authFailureMessage = null;
    try {
      final tokens = await api.data('POST', 'auth/refresh',
          public: true, body: {'refreshToken': old.refreshToken});
      final value = Session.fromTokens(tokens, old.staff);
      if (!mounted || _generation != generation || !value.staff.active) {
        return false;
      }
      await _accept(value);
      if (!mounted || _generation != generation) return false;
      try {
        final staff = await decodeStaffProfile(
            await api.data('GET', 'auth/me', bearerToken: value.accessToken),
            username: old.staff.username);
        if (!mounted || _generation != generation || !staff.active) {
          return false;
        }
        await _accept(value.withStaff(staff));
      } on ApiException catch (e) {
        if (e.status == 401 || e.status == 403) {
          api.authFailureMessage = e.message;
          return false;
        }
        // Rotation succeeded: keep the new tokens if the profile server is temporarily unreachable.
      }
      return mounted && _generation == generation;
    } on ApiException catch (e) {
      if (e.status == 401 || e.status == 403) {
        api.authFailureMessage = e.message;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  Future<void> revalidate() async {
    if (!mounted) return;
    if (state.session == null || _signingOut) return;
    final generation = _generation;
    try {
      final staff = await decodeStaffProfile(await api.data('GET', 'auth/me'),
          username: state.session!.staff.username);
      if (!mounted || generation != _generation || state.session == null) {
        return;
      }
      if (!staff.active) {
        await signOut(remote: false);
        return;
      }
      await _accept(state.session!.withStaff(staff));
    } on ApiException catch (e) {
      if (e.status == 401 || e.status == 403) {
        await signOut(remote: false, message: e.message);
      }
    }
  }

  Future<void> signOut({bool remote = true, String? message}) async {
    if (!mounted || _signingOut) return;
    _signingOut = true;
    _generation++;
    final old = state.session;
    final local = workspace;
    workspace = null;
    if (local != null) local.active = false;
    state = SessionState(ready: true, message: message);
    try {
      if (remote && old != null) {
        try {
          await api.dio.post<dynamic>('auth/logout',
              data: {'refreshToken': old.refreshToken},
              options: Options(
                  headers: {'Authorization': 'Bearer ${old.accessToken}'}));
        } catch (_) {
          /* Local sign-out works even when the server is unavailable. */
        }
      }
      await local?.close();
      await _authWrites;
      await vault.delete('session');
    } finally {
      _signingOut = false;
    }
  }

  Future<void> setServer(String value) async {
    if (!developmentToolsEnabled) {
      throw const ApiException(
          'Server changes are only available in debug builds.');
    }
    final normalized = normalizeServer(value, allowHttp: !kReleaseMode);
    if (normalized == server) return;
    await signOut();
    await forgetQuickLogin();
    await preferences.setString('server', normalized);
    api.setServer(normalized);
    state = const SessionState(ready: true);
  }

  @override
  void dispose() {
    _generation++;
    workspace?.active = false;
    api.token = null;
    api.refresh = null;
    api.expired = null;
    super.dispose();
  }
}
