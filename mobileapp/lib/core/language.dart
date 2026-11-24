import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'localization.dart';
import 'session.dart';

class LanguageController extends StateNotifier<Locale> {
  final SharedPreferences preferences;
  LanguageController(this.preferences)
      : super(Locale(
            preferences.getString('app_language') == 'am' ? 'am' : 'en'));
  Future<void> select(String code) async {
    if (!['en', 'am'].contains(code)) return;
    state = Locale(code);
    await preferences.setString('app_language', code);
  }
}

final languageProvider = StateNotifierProvider<LanguageController, Locale>(
    (ref) => LanguageController(ref.read(preferencesProvider)));

class LanguageChoice extends ConsumerWidget {
  final bool compact;
  const LanguageChoice({this.compact = false, super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(languageProvider);
    final items = const [
      DropdownMenuItem(value: 'en', child: Text('English')),
      DropdownMenuItem(value: 'am', child: Text('አማርኛ')),
    ];
    void change(String? code) {
      if (code != null) ref.read(languageProvider.notifier).select(code);
    }

    if (compact) {
      return Semantics(
          label: context.t('Language'),
          child: DropdownButton<String>(
              value: locale.languageCode,
              underline: const SizedBox.shrink(),
              items: items,
              onChanged: change));
    }
    return DropdownButtonFormField<String>(
        initialValue: locale.languageCode,
        decoration: InputDecoration(labelText: context.t('Language')),
        items: items,
        onChanged: change);
  }
}
