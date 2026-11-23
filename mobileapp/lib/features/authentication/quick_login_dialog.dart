import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';

/// Temporary account setup. Credentials are verified by the real PIN endpoint.
Future<void> configureQuickLogin(
    BuildContext context, SessionController session,
    {String initialUsername = ''}) async {
  if (!temporaryQuickLoginEnabled) return;
  final form = GlobalKey<FormState>();
  var username = initialUsername, pin = '';
  var busy = false;
  String? error;
  await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (_) => StatefulBuilder(
          builder: (c, change) => PopScope(
              canPop: !busy,
              child: AlertDialog(
                  title: const Text('Add quick sign-in account'),
                  content: SizedBox(
                      width: 400,
                      child: SingleChildScrollView(
                          child: Form(
                              key: form,
                              child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  crossAxisAlignment:
                                      CrossAxisAlignment.stretch,
                                  children: [
                                    const Text(
                                        'Add a backend account for quick sign-in on this device.'),
                                    const SizedBox(height: 16),
                                    TextFormField(
                                        initialValue: username,
                                        enabled: !busy,
                                        autocorrect: false,
                                        textCapitalization:
                                            TextCapitalization.none,
                                        decoration: const InputDecoration(
                                            labelText: 'Username'),
                                        onChanged: (value) => username = value,
                                        validator: (value) => value == null ||
                                                value.trim().isEmpty
                                            ? 'Enter the test account username.'
                                            : value.trim().length > 50
                                                ? 'Use at most 50 characters.'
                                                : null),
                                    const SizedBox(height: 16),
                                    TextFormField(
                                        enabled: !busy,
                                        obscureText: true,
                                        autocorrect: false,
                                        enableSuggestions: false,
                                        keyboardType: TextInputType.number,
                                        inputFormatters: [
                                          FilteringTextInputFormatter.digitsOnly
                                        ],
                                        maxLength: 6,
                                        decoration: const InputDecoration(
                                            labelText: 'PIN', counterText: ''),
                                        onChanged: (value) => pin = value,
                                        validator: (value) =>
                                            RegExp(r'^\d{4,6}$')
                                                    .hasMatch(value ?? '')
                                                ? null
                                                : 'Enter a 4–6 digit PIN.'),
                                    if (error != null)
                                      Notice(error!, error: true),
                                  ])))),
                  actions: [
                    TextButton(
                        onPressed: busy ? null : () => Navigator.pop(c),
                        child: const Text('Cancel')),
                    FilledButton(
                        onPressed: busy
                            ? null
                            : () async {
                                if (!form.currentState!.validate()) return;
                                change(() {
                                  busy = true;
                                  error = null;
                                });
                                try {
                                  await session.addQuickLoginAccount(
                                      username, pin);
                                  if (c.mounted) Navigator.pop(c);
                                } catch (e) {
                                  if (c.mounted) {
                                    change(() {
                                      busy = false;
                                      error = '$e';
                                    });
                                  }
                                }
                              },
                        child: Text(busy ? 'Saving…' : 'Save account')),
                  ]))));
}
