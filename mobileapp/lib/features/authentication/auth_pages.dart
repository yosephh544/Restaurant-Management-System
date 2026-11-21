import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/demo.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';

Future<String?> chooseDemoRole(BuildContext context) => showDialog<String>(
    context: context,
    builder: (c) => AlertDialog(
            title: const Text('Choose your role'),
            content: SizedBox(
                width: 360,
                child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text('Select a staff role to continue.'),
                      const SizedBox(height: 16),
                      for (final role in DemoRestaurant.roles)
                        Padding(
                            padding: const EdgeInsets.only(bottom: 8),
                            child: OutlinedButton(
                                onPressed: () => Navigator.pop(c, role),
                                child: Text(role))),
                    ])),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(c),
                  child: const Text('Cancel'))
            ]));

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
                                hintText: 'http://10.0.2.2:5012/api/v1')),
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
  final _phone = TextEditingController(), _credential = TextEditingController();
  bool _pin = true, _busy = false, _visible = false;
  String? _error;
  @override
  void dispose() {
    _phone.dispose();
    _credential.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(sessionProvider.notifier)
          .login(_phone.text, _credential.text, _pin);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _tryDemo() async {
    final role = await chooseDemoRole(context);
    if (role == null || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(sessionProvider.notifier).startDemo(role);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
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
                            SegmentedButton<bool>(
                                segments: const [
                                  ButtonSegment(
                                      value: true,
                                      label: Text('PIN'),
                                      icon: Icon(Icons.pin_outlined)),
                                  ButtonSegment(
                                      value: false,
                                      label: Text('Password'),
                                      icon: Icon(Icons.lock_outline)),
                                ],
                                selected: {
                                  _pin
                                },
                                onSelectionChanged: _busy
                                    ? null
                                    : (v) => setState(() {
                                          _pin = v.first;
                                          _credential.clear();
                                          _error = null;
                                        })),
                            const SizedBox(height: 24),
                            Form(
                                key: _form,
                                child: Column(children: [
                                  TextFormField(
                                      controller: _phone,
                                      keyboardType: TextInputType.phone,
                                      enabled: !_busy,
                                      autofillHints: const [
                                        AutofillHints.telephoneNumber
                                      ],
                                      decoration: const InputDecoration(
                                          labelText: 'Staff phone number',
                                          prefixIcon:
                                              Icon(Icons.phone_outlined)),
                                      validator: (v) =>
                                          v == null || v.trim().isEmpty
                                              ? 'Enter your staff phone number.'
                                              : v.trim().length > 20
                                                  ? 'Use at most 20 characters.'
                                                  : null),
                                  const SizedBox(height: 16),
                                  TextFormField(
                                      controller: _credential,
                                      enabled: !_busy,
                                      obscureText: !_visible,
                                      keyboardType: _pin
                                          ? TextInputType.number
                                          : TextInputType.visiblePassword,
                                      onFieldSubmitted: (_) => _login(),
                                      decoration: InputDecoration(
                                          labelText: _pin ? 'PIN' : 'Password',
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
                                      validator: (v) => _pin
                                          ? (RegExp(r'^\d{4,6}$')
                                                  .hasMatch(v ?? '')
                                              ? null
                                              : 'Enter a 4–6 digit PIN.')
                                          : (v == null || v.isEmpty
                                              ? 'Enter your password.'
                                              : null)),
                                ])),
                            if (_error != null) Notice(_error!, error: true),
                            const SizedBox(height: 24),
                            FilledButton(
                                onPressed: _busy ? null : _login,
                                child: Text(_busy ? 'Signing in…' : 'Sign in')),
                            const SizedBox(height: 20),
                            const Divider(),
                            const SizedBox(height: 12),
                            OutlinedButton.icon(
                                onPressed: _busy ? null : _tryDemo,
                                icon: const Icon(Icons.arrow_forward),
                                label: const Text('Continue')),
                          ]))))));
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
                      if (staff.phone.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(staff.phone, style: const TextStyle(color: muted)),
                      ],
                      const SizedBox(height: 8),
                      StatusBadge(staff.role),
                    ])),
              ]))),
      const SizedBox(height: 20),
      if (state.isDemo)
        Card(
            child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      OutlinedButton.icon(
                          onPressed: _busy
                              ? null
                              : () async {
                                  final role = await chooseDemoRole(context);
                                  if (role == null || !mounted) return;
                                  setState(() => _busy = true);
                                  try {
                                    await ref
                                        .read(sessionProvider.notifier)
                                        .switchDemoRole(role);
                                    if (context.mounted) context.go('/');
                                  } catch (e) {
                                    if (context.mounted) showError(context, e);
                                  } finally {
                                    if (mounted) setState(() => _busy = false);
                                  }
                                },
                          icon: const Icon(Icons.switch_account_outlined),
                          label: const Text('Change role')),
                    ]))),
      if (!state.isDemo)
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
                  if (!state.isDemo &&
                      !await confirmAction(context, 'Sign out?',
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
                  'Use a waiter, kitchen or cashier account.',
                  icon: Icons.badge_outlined,
                  action: FilledButton(
                      onPressed: () =>
                          ref.read(sessionProvider.notifier).signOut(),
                      child: const Text('Sign out'))))));
}
