import 'dart:async';
import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';
import 'demo.dart';
import 'models.dart';

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

// Demo drafts and payments never enter the device's real secure storage.
class _DemoVault implements Vault {
  final Map<String, String> values = {};
  @override
  Future<String?> read(String key) async => values[key];
  @override
  Future<void> write(String key, String value) async => values[key] = value;
  @override
  Future<void> delete(String key) async => values.remove(key);
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
  final bool ready;
  final bool isDemo;
  const SessionState({this.session, this.ready = false, this.isDemo = false});
}

final preferencesProvider = Provider<SharedPreferences>(
    (ref) => throw UnimplementedError('Preferences must be initialized.'));
final vaultProvider = Provider<Vault>((ref) => SecureVault());
const defaultServer = String.fromEnvironment('API_BASE_URL',
    defaultValue: 'http://10.0.2.2:5012/api/v1');
final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(
    ref.read(preferencesProvider).getString('server') ?? defaultServer));
final restaurantApiProvider = Provider<RestaurantApi>(
    (ref) => RestaurantApi(ref.read(apiClientProvider)));
final sessionProvider =
    StateNotifierProvider<SessionController, SessionState>((ref) {
  final controller = SessionController(ref.read(apiClientProvider),
      ref.read(vaultProvider), ref.read(preferencesProvider));
  unawaited(controller.restore());
  return controller;
});

class SessionController extends StateNotifier<SessionState> {
  final ApiClient api;
  final Vault vault;
  final SharedPreferences preferences;
  Future<bool>? _refreshing;
  Future<void> _authWrites = Future.value();
  LocalWorkspace? workspace;
  int _generation = 0;
  bool _signingOut = false;
  DemoRestaurant? _demo;
  _DemoVault? _demoVault;
  HttpClientAdapter? _liveAdapter;
  SessionController(this.api, this.vault, this.preferences)
      : super(const SessionState()) {
    api.token = () => state.session?.accessToken;
    api.refresh = refresh;
    api.expired = () => unawaited(signOut(remote: false));
  }
  String get server => api.dio.options.baseUrl.replaceFirst(RegExp(r'/$'), '');
  Future<void> _accept(Session value, {bool persist = true}) async {
    if (!mounted || _signingOut) return;
    final generation = _generation;
    if (persist && _demo == null) {
      final write = _authWrites.then((_) => vault.write(
          'session', jsonEncode({'server': server, ...value.toJson()})));
      _authWrites = write.catchError((Object _) {});
      await write;
    }
    if (!mounted || _signingOut || generation != _generation) return;
    workspace ??= LocalWorkspace(_demoVault ?? vault,
        _demo == null ? server : 'offline-demo', value.staff.id);
    state = SessionState(session: value, ready: true, isDemo: _demo != null);
  }

  Future<void> startDemo(String role) async {
    if (_signingOut || state.session != null) {
      throw const ApiException('Sign out before changing accounts.');
    }
    final demo = DemoRestaurant();
    final value = demo.session(role);
    _generation++;
    _liveAdapter = api.dio.httpClientAdapter;
    _demo = demo;
    _demoVault = _DemoVault();
    api.dio.httpClientAdapter = demo;
    await _accept(value, persist: false);
    await _saveDemoPayments(value.staff);
  }

  Future<void> switchDemoRole(String role) async {
    final demo = _demo;
    if (demo == null || _signingOut) {
      throw const ApiException('Choose a role to continue.');
    }
    final value = demo.session(role);
    if (state.session?.staff.id == value.staff.id) return;
    _generation++;
    workspace?.active = false;
    workspace = null;
    await _accept(value, persist: false);
    await _saveDemoPayments(value.staff);
  }

  Future<void> _saveDemoPayments(Staff staff) async {
    if (staff.kitchen) return;
    final local = workspace!;
    for (final payment in _demo!.paymentsFor(staff)) {
      await local.saveSession(payment);
    }
  }

  Future<void> restore() async {
    final generation = _generation;
    try {
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
      state = SessionState(
          session: state.session, ready: true, isDemo: _demo != null);
    }
  }

  Future<void> login(String phone, String credential, bool pin) async {
    if (_demo != null) {
      throw const ApiException(
          'Sign out before signing in to another account.');
    }
    if (_signingOut) {
      throw const ApiException(
          'Sign-out is still completing. Please try again in a moment.');
    }
    final generation = _generation;
    normalizeServer(server, allowHttp: !kReleaseMode);
    final tokens = await api.data('POST', pin ? 'auth/pin-login' : 'auth/login',
        public: true,
        body: {'phone': phone.trim(), pin ? 'pin' : 'password': credential});
    final staff = Staff.fromJson(await api.data('GET', 'auth/me',
        bearerToken: tokens['accessToken'] as String));
    final value = Session.fromTokens(tokens, staff);
    if (!value.staff.active) {
      throw const ApiException(
          'This staff account is inactive. Contact your manager.');
    }
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
        final staff = Staff.fromJson(
            await api.data('GET', 'auth/me', bearerToken: value.accessToken));
        if (!mounted || _generation != generation || !staff.active)
          return false;
        await _accept(value.withStaff(staff));
      } on ApiException catch (e) {
        if (e.status == 401 || e.status == 403) return false;
        // Rotation succeeded: keep the new tokens if profile refresh is temporarily offline.
      }
      return mounted && _generation == generation;
    } catch (_) {
      return false;
    }
  }

  Future<void> revalidate() async {
    if (!mounted) return;
    if (state.session == null || _signingOut) return;
    final generation = _generation;
    try {
      final staff = Staff.fromJson(await api.data('GET', 'auth/me'));
      if (!mounted || generation != _generation || state.session == null) {
        return;
      }
      if (!staff.active) {
        await signOut(remote: false);
        return;
      }
      await _accept(state.session!.withStaff(staff));
    } on ApiException catch (e) {
      if (e.status == 401 || e.status == 403) await signOut(remote: false);
    }
  }

  Future<void> signOut({bool remote = true}) async {
    if (!mounted || _signingOut) return;
    _signingOut = true;
    _generation++;
    final old = state.session;
    final local = workspace;
    final demo = _demo;
    workspace = null;
    if (local != null) local.active = false;
    state = const SessionState(ready: true);
    try {
      if (remote && old != null && demo == null) {
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
      if (demo == null) await vault.delete('session');
    } finally {
      if (demo != null) {
        api.dio.httpClientAdapter = _liveAdapter!;
        _liveAdapter = null;
        _demo = null;
        _demoVault = null;
      }
      _signingOut = false;
    }
  }

  Future<void> setServer(String value) async {
    final normalized = normalizeServer(value, allowHttp: !kReleaseMode);
    if (normalized == server) return;
    await signOut();
    await preferences.setString('server', normalized);
    api.setServer(normalized);
  }

  @override
  void dispose() {
    _generation++;
    workspace?.active = false;
    api.token = null;
    api.refresh = null;
    api.expired = null;
    if (_liveAdapter != null) api.dio.httpClientAdapter = _liveAdapter!;
    super.dispose();
  }
}
