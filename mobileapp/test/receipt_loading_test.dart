import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobileapp/core/localization.dart';
import 'package:mobileapp/features/payments/payment_pages.dart';
import 'backend_compatibility_test.dart' as fixture;
import 'support.dart';

class _DelayedReceiptBackend extends fixture.Backend {
  final verification = Completer<void>();
  @override
  Future<FakeReply> handle(RequestOptions request) async {
    if (request.uri.path.endsWith('/payments/record')) {
      await verification.future;
    }
    return super.handle(request);
  }
}

void main() {
  for (final bank in ['CBE', 'TELEBIRR']) {
    testWidgets('$bank QR verification stays visible until the bank responds',
        (tester) async {
      tester.view.physicalSize = const Size(320, 740);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final locale = Locale(bank == 'CBE' ? 'en' : 'am');
      final strings = AppStrings(locale);
      final backend = _DelayedReceiptBackend();
      final qr = bank == 'CBE'
          ? 'https://mbreciept.cbe.com.et/v2-aB3dEfGh4JkLmN5pQrSt'
          : 'https://transactioninfo.ethiotelecom.et/receipt/DET0SAMPLE';
      final deps = await fixture.pumpMobile(
          tester, backend, 'Waiter', '/orders/$orderId',
          locale: locale, scanner: (_) async => qr);
      try {
        await fixture.tap(tester, strings.text('Take payment'));
        await fixture.tap(tester, strings.text('Generate bill'));
        await tester.tap(find.byKey(const ValueKey('scan-receipt')));
        await tester.pump();
        await tester.pump(const Duration(seconds: 2));

        expect(
            find.byKey(const ValueKey('receipt-processing')), findsOneWidget);
        final spinner = tester.widget<CircularProgressIndicator>(
            find.byType(CircularProgressIndicator));
        expect(
            spinner.semanticsLabel,
            strings.text(bank == 'CBE'
                ? 'Checking CBE receipt…'
                : 'Checking Telebirr receipt…'));
        expect(find.text(strings.text('Accept cash')), findsNothing);
        expect(find.byKey(const ValueKey('scan-receipt')), findsNothing);
        expect(backend.payment, isNull);
        expect(
            deps.adapter.requests
                .where((r) => r.uri.path.endsWith('/payments/record')),
            hasLength(1));
        expect(tester.takeException(), isNull);

        backend.verification.complete();
        await tester.pumpAndSettle();
        expect(find.byKey(const ValueKey('receipt-processing')), findsNothing);
        expect(find.byType(PaymentPage), findsOneWidget);
        expect(find.text(strings.text('Receipt verified')), findsOneWidget);
      } finally {
        if (!backend.verification.isCompleted) backend.verification.complete();
        await fixture.closeApp(tester);
      }
    });
  }

  testWidgets('failed verification restores manual receipt and cash entries',
      (tester) async {
    final backend = _DelayedReceiptBackend()..receiptUnavailable = true;
    const qr = 'https://transactioninfo.ethiotelecom.et/receipt/DET0SAMPLE';
    await fixture.pumpMobile(tester, backend, 'Waiter', '/orders/$orderId');
    try {
      await fixture.tap(tester, 'Take payment');
      await fixture.tap(tester, 'Generate bill');
      await tester.enterText(
          find.byKey(const ValueKey('cash-tendered')), '150');
      await fixture.tap(tester, 'Enter receipt manually');
      await tester.enterText(find.byKey(const ValueKey('payment-receipt')), qr);
      await tester.ensureVisible(find.text('Verify payment'));
      await tester.tap(find.text('Verify payment'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.byKey(const ValueKey('receipt-processing')), findsOneWidget);

      backend.verification.complete();
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('receipt-processing')), findsNothing);
      expect(
          find.textContaining('receipt service unavailable'), findsOneWidget);
      expect(find.byKey(const ValueKey('payment-receipt')), findsOneWidget);
      expect(
          tester
              .widget<TextField>(find.byKey(const ValueKey('payment-receipt')))
              .controller!
              .text,
          qr);
      expect(find.text('150'), findsOneWidget);
      expect(backend.payment, isNull);

      backend.receiptUnavailable = false;
      await fixture.tap(tester, 'Verify payment');
      expect(find.byType(PaymentPage), findsOneWidget);
      expect(find.text('Receipt verified'), findsOneWidget);
      expect(tester.takeException(), isNull);
    } finally {
      if (!backend.verification.isCompleted) backend.verification.complete();
      await fixture.closeApp(tester);
    }
  });
}
