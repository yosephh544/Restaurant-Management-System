import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobileapp/core/api.dart';
import 'package:mobileapp/core/router.dart';
import 'package:mobileapp/core/session.dart';
import 'package:mobileapp/features/orders/orders_page.dart';
import 'package:mobileapp/features/payments/payment_pages.dart';
import 'package:mobileapp/features/payments/receipt_scanner.dart';
import 'package:mobileapp/main.dart';
import 'backend_compatibility_test.dart' as fixture;
import 'support.dart';

Future<ProviderContainer> _pumpOrders(
    WidgetTester tester, fixture.Backend backend) async {
  final deps = await setup();
  backend.order['createdAt'] = DateTime.now().toUtc().toIso8601String();
  final api = ApiClient(testServer,
      transport: Dio()..httpClientAdapter = FakeAdapter(backend.handle));
  await tester.pumpWidget(ProviderScope(overrides: [
    preferencesProvider.overrideWithValue(deps.prefs),
    vaultProvider.overrideWithValue(deps.vault),
    apiClientProvider.overrideWithValue(api),
    sessionProvider.overrideWith((ref) => fixture.SignedIn(
        api, deps.vault, deps.prefs, fixture.worker('Waiter'))),
    receiptScannerProvider.overrideWithValue((_) async =>
        'https://transactioninfo.ethiotelecom.et/receipt/DET0SAMPLE'),
  ], child: const RmsApp()));
  await tester.pumpAndSettle();
  return ProviderScope.containerOf(tester.element(find.byType(RmsApp)));
}

void main() {
  for (final stage in ['bill', 'payment']) {
    testWidgets('New order hides through $stage and returns after cancellation',
        (tester) async {
      final container = await _pumpOrders(tester, fixture.Backend());
      try {
        expect(find.byType(FloatingActionButton), findsOneWidget);
        await fixture.tap(tester, 'Take payment');
        expect(find.byType(FloatingActionButton), findsNothing);
        expect(container.read(paymentFlowActiveProvider), isTrue);
        if (stage == 'payment') {
          await fixture.tap(tester, 'Generate bill');
          final pageContext = tester.element(find.byType(OrdersPage));
          final dialogContext = tester.element(find.byType(AlertDialog));
          final root = Navigator.of(pageContext, rootNavigator: true);
          expect(Navigator.of(pageContext), isNot(same(root)));
          expect(Navigator.of(dialogContext), same(root));
          expect(find.byType(FloatingActionButton), findsNothing);
          expect(container.read(paymentFlowActiveProvider), isTrue);
          await fixture.tap(tester, 'Close');
        } else {
          await tester.binding.handlePopRoute();
          await tester.pumpAndSettle();
        }
        expect(container.read(paymentFlowActiveProvider), isFalse);
        expect(find.byType(FloatingActionButton), findsOneWidget);
        expect(
            container
                .read(routerProvider)
                .routeInformationProvider
                .value
                .uri
                .path,
            '/orders');
        await tester.tap(find.byType(FloatingActionButton));
        await tester.pumpAndSettle();
        expect(
            container
                .read(routerProvider)
                .routeInformationProvider
                .value
                .uri
                .path,
            '/orders/new');
        expect(tester.takeException(), isNull);
      } finally {
        await fixture.closeApp(tester);
      }
    });
  }
  testWidgets('receipt errors keep New order hidden until checkout closes',
      (tester) async {
    final backend = fixture.Backend()..receiptUnavailable = true;
    final container = await _pumpOrders(tester, backend);
    try {
      await fixture.tap(tester, 'Take payment');
      await fixture.tap(tester, 'Generate bill');
      await fixture.tap(tester, 'Scan receipt QR');
      expect(
          find.textContaining('receipt service unavailable'), findsOneWidget);
      expect(find.byType(FloatingActionButton), findsNothing);
      expect(container.read(paymentFlowActiveProvider), isTrue);
      await fixture.tap(tester, 'Close');
      expect(find.byType(FloatingActionButton), findsOneWidget);
      expect(container.read(paymentFlowActiveProvider), isFalse);
      expect(backend.payment, isNull);
      expect(tester.takeException(), isNull);
    } finally {
      await fixture.closeApp(tester);
    }
  });
  testWidgets('successful payment releases the flow and opens payment details',
      (tester) async {
    final backend = fixture.Backend();
    final container = await _pumpOrders(tester, backend);
    try {
      await fixture.tap(tester, 'Take payment');
      await fixture.tap(tester, 'Generate bill');
      await tester.enterText(
          find.byKey(const ValueKey('cash-tendered')), '150');
      await fixture.tap(tester, 'Accept cash');
      expect(find.byType(PaymentPage), findsOneWidget);
      expect(find.byType(FloatingActionButton), findsNothing);
      expect(container.read(paymentFlowActiveProvider), isFalse);
      expect(backend.payment!['status'], 'PAID');
      expect(tester.takeException(), isNull);
    } finally {
      await fixture.closeApp(tester);
    }
  });
}
