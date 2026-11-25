import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:mobileapp/core/language.dart';
import 'package:mobileapp/core/localization.dart';
import 'package:mobileapp/core/models.dart';
import 'package:mobileapp/core/session.dart';
import 'package:mobileapp/main.dart';
import 'backend_compatibility_test.dart' as fixture;
import 'support.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const english = AppStrings(Locale('en'));
  const amharic = AppStrings(Locale('am'));
  test('login server errors retain account-specific guidance in both languages',
      () {
    for (final message in [
      'The server could not load your staff profile. Ask your manager to check the server configuration.',
      'The server could not complete sign-in. Try again later or contact your manager.',
    ]) {
      expect(english.text(message), message);
      expect(amharic.text(message), contains(RegExp('[\u1200-\u137F]')));
      expect(amharic.text(message), isNot(message));
    }
  });
  test(
      'receipt errors distinguish earlier, future, missing and reused payments',
      () {
    const old =
        "This payment was made before the order or dining session started. Use the receipt for this order's payment.";
    expect(english.text(old),
        'This receipt is for an earlier payment. Use the receipt for this order.');
    final messages = [
      old,
      "The bank receipt's payment time is in the future. Check the receipt and try again.",
      'The bank receipt has no readable payment date and time. Obtain a receipt that shows when the payment was made.',
      'This bank receipt has already been used for another payment.',
    ];
    final translated = messages.map(amharic.text).toSet();
    expect(translated, hasLength(4));
    for (final text in translated) {
      expect(text, contains(RegExp('[\u1200-\u137F]')));
      expect(text, isNot(contains('Exception')));
    }
    expect(amharic.text('System.ArgumentException: secret internals'),
        amharic.text('Something went wrong. Refresh and try again.'));
  });
  test('dynamic labels translate while retaining amounts and references', () {
    expect(amharic.text('Today’s tips: ETB 1,250.00'), 'የዛሬ ቲፕ፦ 1,250.00 ብር');
    expect(amharic.text('Today’s tips: ETB 50.00 · refresh failed'),
        'የዛሬ ቲፕ፦ 50.00 ብር · ማደስ አልተቻለም');
    expect(amharic.text('ORD-1042 · Table T12'), 'ORD-1042 · ጠረጴዛ T12');
    expect(amharic.text('Pay Table T12'), 'ለጠረጴዛ T12 ክፈል');
    expect(amharic.text('Return ETB 150.00 to the customer before confirming.'),
        'ከማረጋገጥዎ በፊት 150.00 ብር ለደንበኛው ይመልሱ።');
    expect(amharic.text('Table {p1}', parameters: {'p1': 'T12'}), 'ጠረጴዛ T12');
    expect(amharic.text('https://receipt.example/FT123'),
        'https://receipt.example/FT123');
  });
  test('language persists and unsupported settings fall back to English',
      () async {
    SharedPreferences.setMockInitialValues({'app_language': 'fr'});
    final preferences = await SharedPreferences.getInstance();
    final controller = LanguageController(preferences);
    expect(controller.state.languageCode, 'en');
    await controller.select('am');
    expect(preferences.getString('app_language'), 'am');
    final reopened = LanguageController(preferences);
    expect(reopened.state.languageCode, 'am');
    await reopened.select('fr');
    expect(reopened.state.languageCode, 'am');
    controller.dispose();
    reopened.dispose();
  });
  test('Amharic dish names survive unsent draft storage', () {
    final item = MenuItem.fromJson({...menuJson(), 'nameAm': 'የተጠበሰ ዶሮ'});
    final draft = DraftLine.fromJson(DraftLine(item, 2, 'No spice').toJson());
    expect(draft.item.nameAm, 'የተጠበሰ ዶሮ');
    expect(draft.toRequest()['customerNotes'], 'No spice');
    expect(draft.toRequest()['menuItemId'], itemId);
  });
  testWidgets(
      'sign-in language choice applies immediately and survives app recreation',
      (tester) async {
    tester.view.physicalSize = const Size(320, 740);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await pumpApp(tester, FakeRestaurant(), signedIn: false);
    await tester.tap(find.text('English').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('አማርኛ').last);
    await tester.pumpAndSettle();
    expect(find.widgetWithText(FilledButton, 'ግባ'), findsOneWidget);
    await tester.ensureVisible(find.widgetWithText(FilledButton, 'ግባ'));
    await tester.tap(find.widgetWithText(FilledButton, 'ግባ'));
    await tester.pumpAndSettle();
    expect(find.text('የተጠቃሚ ስምዎን ያስገቡ።'), findsOneWidget);
    final container =
        ProviderScope.containerOf(tester.element(find.byType(RmsApp)));
    final preferences = container.read(preferencesProvider);
    expect(preferences.getString('app_language'), 'am');
    await fixture.closeApp(tester);
    await tester.pumpWidget(ProviderScope(overrides: [
      preferencesProvider.overrideWithValue(preferences),
      vaultProvider.overrideWithValue(MemoryVault()),
    ], child: const RmsApp()));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(FilledButton, 'ግባ'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await fixture.closeApp(tester);
  });
  for (final entry in [
    ('Waiter', '/orders/$orderId'),
    ('Waiter', '/orders/new'),
    ('Cashier', '/sessions/$paymentId'),
  ]) {
    testWidgets('Amharic ${entry.$1} ${entry.$2} fits a narrow phone',
        (tester) async {
      tester.view.physicalSize = const Size(320, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final backend = fixture.Backend()..generated = true;
      backend.payment = {
        ...backend.makePayment('CBE'),
        'receiptReference': 'FT1234567890',
      };
      backend.order['items'][0]['menuItemNameAm'] = 'የተጠበሰ ዶሮ';
      await fixture.pumpMobile(tester, backend, entry.$1, entry.$2,
          locale: const Locale('am'));
      expect(find.textContaining('ETB'), findsNothing);
      expect(tester.takeException(), isNull);
      if (entry.$2.contains('sessions')) {
        expect(find.text('FT1234567890'), findsOneWidget);
        expect(find.text('የክፍያ ዝርዝር'), findsOneWidget);
      }
      await fixture.closeApp(tester);
    });
  }
}
