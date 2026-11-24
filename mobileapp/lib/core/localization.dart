import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'translations_am.dart';

const supportedAppLocales = [Locale('en'), Locale('am')];

const _clearCopy = <String, String>{
  'Invalid username or password.': 'Check your username and PIN.',
  'Invalid PIN. Please try again.': 'Incorrect PIN. Try again.',
  'This account has been deactivated. Contact your manager.':
      'This account is inactive. Ask your manager for help.',
  'Your session has expired. Please log in again.':
      'Your session expired. Please sign in again.',
  'The provided token is invalid.':
      'Your session expired. Please sign in again.',
  'An order must contain at least one item.': 'Add at least one item.',
  'A table number is required for dine-in orders.':
      'Choose a table for dine-in.',
  'Items cannot be added once payment has been initiated or settled.':
      'Items cannot be added after payment starts.',
  'Items cannot be added after the table bill has been generated.':
      'Ask the cashier to reopen the bill before adding items.',
  'Cannot add items to a kitchen-cancelled order.':
      'This order was cancelled. Create a replacement order.',
  'This older CBE reference needs the full receipt link, including its account suffix. Scan or paste that link, or use the current CBE receipt link.':
      'This CBE receipt needs its full link. Scan or paste the receipt link.',
  'CBE could not find this older receipt using that account suffix. Scan or paste the full receipt link from the customer\'s transaction, or use the current CBE receipt link.':
      'CBE could not find this receipt. Check its full link.',
  'The bank could not find this receipt. Check the reference or obtain the current receipt link.':
      'Receipt not found. Check the reference or use the full receipt link.',
  'Provide one receipt QR, receipt link, or transaction reference.':
      'Scan a receipt or enter its link or reference.',
  'This is not a supported CBE or Telebirr receipt. Scan or paste the customer\'s transaction receipt.':
      'Use a CBE or Telebirr payment receipt.',
  'The bank receipt has no valid ETB payment amount or transaction reference.':
      'The receipt has no valid amount or reference. Use a complete receipt.',
  'The bank has not confirmed a completed payment.':
      'The bank has not confirmed this payment. Check its status with the customer.',
  'The bill\'s orders changed. Generate and review the current bill.':
      'The bill changed. Close this screen and review the bill again.',
  'An order changed during payment verification. Refresh the bill.':
      'The order changed. Refresh the bill before paying.',
  'This payment was made before the order or dining session started. Use the receipt for this order\'s payment.':
      'This receipt is for an earlier payment. Use the receipt for this order.',
  'The bank receipt has no readable payment date and time. Obtain a receipt that shows when the payment was made.':
      'The receipt has no payment date or time. Use a complete receipt.',
  'The bank receipt\'s payment time is in the future. Check the receipt and try again.':
      'The receipt shows a future payment time. Check the receipt date.',
  'This bank receipt has already been used for another payment.':
      'This receipt was already used. Use another receipt.',
  'The bank receipt does not identify the restaurant\'s receiving account. Check the recipient and use a receipt that shows the receiving account.':
      'Cannot confirm the restaurant as the receiver. Check the receipt account.',
  'The server did not confirm this receipt as paid. Check the bill before trying again.':
      'Payment is not confirmed. Check payment history before trying again.',
  'The server recorded a different payment total. Close and check the saved payment before submitting again.':
      'The payment total changed. Check payment history before trying again.',
  'Check the order before trying another payment.':
      'Check payment history before trying again.',
  'The table bill changed. Close and review it again before paying.':
      'The bill changed. Close this screen and review the bill again.',
  'The table changed. Review its updated bill before continuing.':
      'The bill changed. Review the updated total.',
  'The bank confirms the receipt before this bill is paid. Any overpayment becomes the waiter’s tip.':
      'We verify the receipt before recording payment. Extra payment is recorded as a tip.',
  'Checking CBE… Verifying payment…': 'Checking CBE receipt…',
  'Checking Telebirr… Verifying payment…': 'Checking Telebirr receipt…',
  'The restaurant server could not finish this request. Refresh the current record before trying again.':
      'The request was not completed. Refresh before trying again.',
  'The server response was not received. Check the order or session before submitting again.':
      'No response received. Check the order before trying again.',
  'The server returned an unexpected response. Check the server URL.':
      'Cannot read the server response. Check the server address.',
  'Could not read your staff profile. Check that the app profile key matches the restaurant server.':
      'Cannot load your account. Ask your manager to check the app settings.',
  'The app needs the restaurant profile key. Contact your administrator.':
      'The app is not configured. Ask your manager for help.',
  'This ticket changed. Check its current status before continuing.':
      'The order changed. Refresh and try again.',
  'The order changed. Check its current status before continuing.':
      'The order changed. Refresh and try again.',
  'Close and reopen this bill to check whether it was generated before trying again.':
      'Close and reopen the bill to check its status.',
  'Only a settled payment on a served, cancelled, or refund-pending order can be refunded.':
      'This payment cannot be refunded now. Refresh the order details.',
  'Welcome back. Sign in to start your service.':
      'Enter your username and PIN.',
  'Your staff details and restaurant connection.':
      'Your account and app settings.',
  'Sign-in and session renewal are outside your current shift window.':
      'Your shift has ended. Sign in during your next shift.',
  'Add to the table': 'Add items',
  'The takeaway order is no longer eligible for payment.':
      'This order cannot be paid now. Refresh its details.',
  'The order is no longer eligible for payment. Refresh its details.':
      'This order cannot be paid now. Refresh its details.',
};

class AppStrings {
  final Locale locale;
  const AppStrings(this.locale);
  bool get isAmharic => locale.languageCode == 'am';
  static AppStrings of(BuildContext context) =>
      Localizations.of<AppStrings>(context, AppStrings) ??
      const AppStrings(Locale('en'));

  String text(String value, {Map<String, Object> parameters = const {}}) {
    var clear = _clearCopy[value] ?? value;
    if (clear.startsWith('The service ') &&
        (clear.contains("'CBE'") || clear.contains("'TELEBIRR'"))) {
      clear = clear.contains('receiving account')
          ? 'The restaurant’s bank account is not set up. Ask your manager for help.'
          : clear.contains('older CBE receipt')
              ? 'CBE could not verify this receipt. Use a current receipt link from the CBE app.'
              : 'The bank receipt service is unavailable. The bill has not been paid.';
    }
    if (clear.contains('System.') ||
        clear.contains('Exception:') ||
        clear.startsWith('TypeError') ||
        clear.startsWith('FormatException')) {
      clear = 'Something went wrong. Refresh and try again.';
    }
    var result = isAmharic ? _translate(clear) : clear;
    for (final parameter in parameters.entries) {
      result = result.replaceAll('{${parameter.key}}', '${parameter.value}');
    }
    return result;
  }

  String _translate(String text, [int depth = 0]) {
    final direct = amharicTranslations[text];
    if (direct != null) return direct;
    if (depth > 3) return text;
    for (final template in _templates) {
      // Keep composite labels out of a single placeholder, especially amounts.
      if (['\n', ' · ', ' – '].any((separator) =>
          text.contains(separator) && !template.source.contains(separator))) {
        continue;
      }
      final match = template.pattern.firstMatch(text);
      if (match == null) continue;
      var result = template.translation;
      for (var index = 0; index < template.names.length; index++) {
        result = result.replaceAll('{${template.names[index]}}',
            _translate(match.group(index + 1)!, depth + 1));
      }
      return result;
    }
    for (final separator in ['\n', ' · ', ' – ']) {
      if (text.contains(separator)) {
        return text
            .split(separator)
            .map((part) => _translate(part, depth + 1))
            .join(separator);
      }
    }
    return text;
  }
}

class _TranslationTemplate {
  final String source;
  final RegExp pattern;
  final List<String> names;
  final String translation;
  _TranslationTemplate(this.source, this.translation)
      : names = RegExp(r'\{([a-zA-Z0-9_]+)\}')
            .allMatches(source)
            .map((match) => match.group(1)!)
            .toList(),
        pattern = RegExp(
            '^${RegExp.escape(source).replaceAllMapped(RegExp(r'\\\{[a-zA-Z0-9_]+\\\}'), (_) => '(.*?)')}\$',
            dotAll: true);
}

final _templates = amharicTranslations.entries
    .where((entry) =>
        entry.key.contains('{') &&
        entry.key
            .replaceAll(RegExp(r'\{[^}]+\}'), '')
            .contains(RegExp('[A-Za-z]')))
    .map((entry) => _TranslationTemplate(entry.key, entry.value))
    .toList()
  ..sort(
      (a, b) => b.pattern.pattern.length.compareTo(a.pattern.pattern.length));

class AppStringsDelegate extends LocalizationsDelegate<AppStrings> {
  const AppStringsDelegate();
  @override
  bool isSupported(Locale locale) => ['en', 'am'].contains(locale.languageCode);
  @override
  Future<AppStrings> load(Locale locale) =>
      SynchronousFuture(AppStrings(locale));
  @override
  bool shouldReload(AppStringsDelegate old) => false;
}

extension AppLanguageContext on BuildContext {
  String t(String value, {Map<String, Object> parameters = const {}}) =>
      AppStrings.of(this).text(value, parameters: parameters);
  String get languageCode => AppStrings.of(this).locale.languageCode;
  bool get isAmharic => languageCode == 'am';
  String menuName(String name, String nameAm) =>
      isAmharic && nameAm.trim().isNotEmpty ? nameAm : name;
}

FormFieldValidator<String> localizedValidator(
        BuildContext context, FormFieldValidator<String> validator) =>
    (value) {
      final error = validator(value);
      return error == null ? null : context.t(error);
    };

/// One underlying Text widget keeps semantics and text finders working normally.
class AppText extends StatelessWidget {
  final String data;
  final TextStyle? style;
  final TextAlign? textAlign;
  final TextOverflow? overflow;
  final int? maxLines;
  final bool? softWrap;
  final String? semanticsLabel;
  final TextScaler? textScaler;
  final bool translate;
  const AppText(this.data,
      {super.key,
      this.style,
      this.textAlign,
      this.overflow,
      this.maxLines,
      this.softWrap,
      this.semanticsLabel,
      this.textScaler,
      this.translate = true});
  @override
  Widget build(BuildContext context) => Text(translate ? context.t(data) : data,
      style: style,
      textAlign: textAlign,
      overflow: overflow,
      maxLines: maxLines,
      softWrap: softWrap,
      semanticsLabel: semanticsLabel,
      textScaler: textScaler);
}

class AppSelectableText extends StatelessWidget {
  final String data;
  final TextStyle? style;
  const AppSelectableText(this.data, {super.key, this.style});
  @override
  Widget build(BuildContext context) =>
      SelectableText(context.t(data), style: style);
}
