import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/models.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';
import 'quick_login_dialog.dart';

String _shiftTime(dynamic value) {
  final time = date(value);
  return time == null
      ? ''
      : DateFormat('EEE d MMM, HH:mm')
          .format(time.toUtc().add(const Duration(hours: 3)));
}

Future<void> configureServer(BuildContext context, WidgetRef ref) async {
  final controller = ref.read(sessionProvider.notifier);
  var fieldValue = controller.server;
  final value = await showDialog<String>(
      context: context,
      builder: (c) => AlertDialog(
              title: const Text('Server settings'),
              content: SizedBox(
                  width: 440,
                  child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                            'Changing servers signs you out and clears unsent orders and saved payments.'),
                        const SizedBox(height: 16),
                        TextFormField(
                            initialValue: fieldValue,
                            onChanged: (v) => fieldValue = v,
                            keyboardType: TextInputType.url,
                            autocorrect: false,
                            decoration: const InputDecoration(
                                labelText: 'Server address',
                                hintText: 'http://192.168.1.2:5012/api/v1')),
                      ])),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(c),
                    child: const Text('Cancel')),
                FilledButton(
                    onPressed: () => Navigator.pop(c, fieldValue),
                    child: const Text('Save'))
              ]));
  if (value == null) return;
  try {
    await controller.setServer(value);
  } catch (e) {
    if (context.mounted) showError(context, e);
  }
}

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});
  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _form = GlobalKey<FormState>();
  final _username = TextEditingController(), _pin = TextEditingController();
  bool _busy = false, _visible = false;
  bool _quickLoading = true;
  List<Json> _quickAccounts = [];
  String? _quickServer;
  int _quickLoadGeneration = 0;
  String? _error;
  @override
  void initState() {
    super.initState();
    if (temporaryQuickLoginEnabled) unawaited(_loadQuickAccounts());
  }

  Future<void> _loadQuickAccounts() async {
    final controller = ref.read(sessionProvider.notifier);
    final generation = ++_quickLoadGeneration;
    _quickServer = controller.server;
    setState(() => _quickLoading = true);
    try {
      final accounts = await controller.quickLoginAccounts();
      if (mounted && generation == _quickLoadGeneration) {
        setState(() => _quickAccounts = accounts);
      }
    } catch (_) {
      if (mounted && generation == _quickLoadGeneration) {
        setState(() {
          _quickAccounts = [];
          _error = 'Could not load the quick sign-in account.';
        });
      }
    } finally {
      if (mounted && generation == _quickLoadGeneration) {
        setState(() => _quickLoading = false);
      }
    }
  }

  Future<void> _quickSignIn(String username) async {
    if (_busy || !temporaryQuickLoginEnabled) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(sessionProvider.notifier).quickLogin(username);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        await _loadQuickAccounts();
      }
    }
  }

  Future<void> _addQuickAccount() async {
    if (_busy || !temporaryQuickLoginEnabled) return;
    final controller = ref.read(sessionProvider.notifier);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await configureQuickLogin(context, controller,
          initialUsername: _username.text.trim());
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) {
        setState(() => _busy = false);
        await _loadQuickAccounts();
      }
    }
  }

  Future<void> _forgetQuickAccount(String username) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(sessionProvider.notifier)
          .forgetQuickLogin(username: username);
      if (mounted) await _loadQuickAccounts();
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not forget the quick sign-in account.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _username.dispose();
    _pin.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(sessionProvider.notifier).login(_username.text, _pin.text);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen(sessionProvider, (_, __) {
      if (temporaryQuickLoginEnabled &&
          ref.read(sessionProvider.notifier).server != _quickServer) {
        unawaited(_loadQuickAccounts());
      }
    });
    return Scaffold(
        body: SafeArea(
            child: Center(
                child: SingleChildScrollView(
                    padding: const EdgeInsets.all(24),
                    child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 430),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Align(
                                  alignment: Alignment.centerRight,
                                  child: TextButton.icon(
                                      onPressed: _busy
                                          ? null
                                          : () => configureServer(context, ref),
                                      icon: const Icon(Icons.settings_ethernet),
                                      label: const Text('Server'))),
                              const SizedBox(height: 20),
                              const Row(children: [
                                BrandMark(size: 72),
                                SizedBox(width: 12),
                                Expanded(
                                    child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                      Text(restaurantName,
                                          style: TextStyle(
                                              color: ink,
                                              fontSize: 20,
                                              fontWeight: FontWeight.w800,
                                              letterSpacing: -.5)),
                                      Text('Restaurant operations',
                                          style: TextStyle(
                                              color: muted, fontSize: 12)),
                                    ])),
                              ]),
                              const SizedBox(height: 26),
                              const Eyebrow('Staff sign-in'),
                              const SizedBox(height: 6),
                              Text('Sign in',
                                  style: Theme.of(context)
                                      .textTheme
                                      .headlineLarge
                                      ?.copyWith(
                                          fontWeight: FontWeight.w800,
                                          color: ink)),
                              const SizedBox(height: 8),
                              const Text(
                                  'Welcome back. Sign in to start your service.',
                                  style: TextStyle(color: muted)),
                              const SizedBox(height: 24),
                              Form(
                                  key: _form,
                                  child: Column(children: [
                                    TextFormField(
                                        controller: _username,
                                        keyboardType: TextInputType.text,
                                        autocorrect: false,
                                        textCapitalization:
                                            TextCapitalization.none,
                                        enabled: !_busy,
                                        autofillHints: const [
                                          AutofillHints.username
                                        ],
                                        decoration: const InputDecoration(
                                            labelText: 'Username',
                                            prefixIcon:
                                                Icon(Icons.person_outline)),
                                        validator: (v) => v == null ||
                                                v.trim().isEmpty
                                            ? 'Enter your staff username.'
                                            : v.trim().length > 50
                                                ? 'Use at most 50 characters.'
                                                : null),
                                    const SizedBox(height: 16),
                                    TextFormField(
                                        controller: _pin,
                                        enabled: !_busy,
                                        obscureText: !_visible,
                                        keyboardType: TextInputType.number,
                                        autocorrect: false,
                                        enableSuggestions: false,
                                        inputFormatters: [
                                          FilteringTextInputFormatter.digitsOnly
                                        ],
                                        maxLength: 6,
                                        onFieldSubmitted: (_) => _login(),
                                        decoration: InputDecoration(
                                            labelText: 'PIN',
                                            counterText: '',
                                            prefixIcon:
                                                const Icon(Icons.lock_outline),
                                            suffixIcon: IconButton(
                                                tooltip:
                                                    _visible ? 'Hide' : 'Show',
                                                onPressed: () => setState(
                                                    () => _visible = !_visible),
                                                icon: Icon(_visible
                                                    ? Icons.visibility_off
                                                    : Icons.visibility))),
                                        validator: (v) => (RegExp(r'^\d{4,6}$')
                                                .hasMatch(v ?? '')
                                            ? null
                                            : 'Enter a 4–6 digit PIN.')),
                                  ])),
                              if (_error != null ||
                                  ref.watch(sessionProvider).message != null)
                                Notice(
                                    _error ??
                                        ref.watch(sessionProvider).message!,
                                    error: true),
                              const SizedBox(height: 24),
                              FilledButton(
                                  onPressed: _busy ? null : _login,
                                  child:
                                      Text(_busy ? 'Signing in…' : 'Sign in')),
                              if (temporaryQuickLoginEnabled) ...[
                                const SizedBox(height: 16),
                                if (_quickAccounts.isNotEmpty) ...[
                                  const Text('Quick sign-in',
                                      style: TextStyle(
                                          fontWeight: FontWeight.w700)),
                                  const SizedBox(height: 8),
                                  for (final account in _quickAccounts)
                                    Padding(
                                        padding:
                                            const EdgeInsets.only(bottom: 8),
                                        child: Row(children: [
                                          Expanded(
                                              child: OutlinedButton(
                                                  onPressed: _busy ||
                                                          _quickLoading
                                                      ? null
                                                      : () => _quickSignIn(
                                                          account['username']
                                                              as String),
                                                  child: Text(
                                                      '${account['username']}${(account['role'] as String).isEmpty ? '' : ' · ${statusLabel(account['role'] as String)}'}'))),
                                          const SizedBox(width: 8),
                                          TextButton(
                                              onPressed: _busy || _quickLoading
                                                  ? null
                                                  : () => _forgetQuickAccount(
                                                      account['username']
                                                          as String),
                                              child: const Text('Remove')),
                                        ])),
                                ],
                                TextButton(
                                    onPressed: _busy || _quickLoading
                                        ? null
                                        : _addQuickAccount,
                                    child: Text(_quickLoading
                                        ? 'Loading quick sign-in…'
                                        : 'Add quick sign-in account')),
                              ],
                            ]))))));
  }
}

class ProfilePage extends ConsumerStatefulWidget {
  const ProfilePage({super.key});
  @override
  ConsumerState<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends ConsumerState<ProfilePage> {
  bool _busy = false;
  @override
  Widget build(BuildContext context) {
    final state = ref.watch(sessionProvider);
    final staff = state.session?.staff;
    if (staff == null) return const SizedBox.shrink();
    return ScreenBody(
        onRefresh: () => ref.read(sessionProvider.notifier).revalidate(),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const ScreenHeading(
              eyebrow: 'Your account',
              title: 'Profile',
              subtitle: 'Your staff details and restaurant connection.'),
          const SizedBox(height: 20),
          Card(
              child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Row(children: [
                    CircleAvatar(
                        radius: 26,
                        backgroundColor: mint,
                        child: const Icon(Icons.person_outline,
                            color: forest, size: 28)),
                    const SizedBox(width: 16),
                    Expanded(
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                          Text(staff.name,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleLarge
                                  ?.copyWith(fontWeight: FontWeight.w700)),
                          if (staff.username.isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text(staff.username,
                                style: const TextStyle(color: muted)),
                          ],
                          if (staff.phone.isNotEmpty) ...[
                            const SizedBox(height: 4),
                            Text(staff.phone,
                                style: const TextStyle(color: muted)),
                          ],
                          const SizedBox(height: 8),
                          StatusBadge(staff.role),
                        ])),
                  ]))),
          const SizedBox(height: 20),
          ...[
            AsyncPane<Json>(
                loadKey: staff.id,
                load: () => ref.read(restaurantApiProvider).myShift(),
                interval: const Duration(minutes: 1),
                builder: (shift, _) => Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text('Your shift',
                              style: Theme.of(context).textTheme.titleMedium),
                          const SizedBox(height: 8),
                          if (shift['unrestricted'] == true)
                            const Text('No shift restriction.'),
                          for (final window in shift['shifts'] as List? ?? [])
                            Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Text(
                                    '${window['name']} · ${_shiftTime(window['startsAt'])} – ${_shiftTime(window['endsAt'])} EAT')),
                          if (shift['message'] != null)
                            Text(shift['message'] as String),
                          if (shift['canSignInNow'] == false)
                            const Text(
                                'Sign-in and session renewal are outside your current shift window.'),
                        ])),
            const SizedBox(height: 20),
          ],
          Card(
              child: ListTile(
                  contentPadding: const EdgeInsets.all(20),
                  leading: const Icon(Icons.settings_ethernet),
                  title: const Text('Server settings'),
                  subtitle: Text(
                      Uri.tryParse(ref.read(sessionProvider.notifier).server)
                              ?.host ??
                          ''),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: _busy ? null : () => configureServer(context, ref))),
          const SizedBox(height: 20),
          OutlinedButton.icon(
              onPressed: _busy
                  ? null
                  : () async {
                      if (!await confirmAction(context, 'Sign out?',
                          'Unsent orders and saved payments will be cleared.')) {
                        return;
                      }
                      if (!mounted) return;
                      setState(() => _busy = true);
                      try {
                        await ref.read(sessionProvider.notifier).signOut();
                      } catch (e) {
                        if (context.mounted) showError(context, e);
                      } finally {
                        if (mounted) setState(() => _busy = false);
                      }
                    },
              icon: const Icon(Icons.logout),
              label: Text(_busy ? 'Signing out…' : 'Sign out')),
        ]));
  }
}

class UnsupportedRolePage extends ConsumerWidget {
  const UnsupportedRolePage({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) => Scaffold(
      body: SafeArea(
          child: Center(
              child: EmptyState('Account not supported',
                  'Use a waiter, kitchen, bartender or cashier account.',
                  icon: Icons.badge_outlined,
                  action: FilledButton(
                      onPressed: () =>
                          ref.read(sessionProvider.notifier).signOut(),
                      child: const Text('Sign out'))))));
}
