import 'package:flutter_test/flutter_test.dart';
import 'package:mobileapp/core/session.dart';
import 'backend_compatibility_test.dart' as fixture;
import 'support.dart';

void main() {
  for (final bank in ['CBE', 'TELEBIRR']) {
    testWidgets(
        '$bank refund keeps the receipt visible and cached after reload',
        (tester) async {
      final reference = bank == 'CBE' ? 'FT26REFUND01' : 'DTREFUND01';
      final url = bank == 'CBE'
          ? 'https://mbreciept.cbe.com.et/v2-$reference'
          : 'https://transactioninfo.ethiotelecom.et/receipt/$reference';
      final backend = fixture.Backend()..generated = true;
      backend.order['paymentStatus'] = 'PAID';
      backend.payment = {
        ...backend.makePayment(bank),
        'receiptUrl': url,
        'receiptReference': reference,
        'amountPaid': 150,
        'verifiedBank': bank,
        'verifiedAt': DateTime.now().toUtc().toIso8601String(),
        'verifiedVia': '$bank receipt',
        'verificationNote':
            'Confirmed directly against the bank receipt dated 2026-11-24T08:30:00.0000000Z.',
      };
      final vault = MemoryVault();
      final deps = await fixture.pumpMobile(
          tester, backend, 'Cashier', '/sessions/$paymentId',
          vault: vault);
      try {
        expect(find.text(url), findsOneWidget);
        expect(find.text(reference), findsOneWidget);
        expect(find.text('Payment time'), findsOneWidget);
        await fixture.tap(tester, 'Record refund');
        expect(find.textContaining('Return ETB 150.00'), findsOneWidget);
        expect(find.textContaining('This does not send money'), findsOneWidget);
        await fixture.tap(tester, 'Record refund');
        expect(find.text('Refunded'), findsOneWidget);
        expect(find.text(url), findsOneWidget);
        expect(find.text(reference), findsOneWidget);
        expect(find.text('Record refund'), findsNothing);
        expect(
            deps.adapter.requests.where(
                (r) => r.method == 'POST' && r.uri.path.endsWith('/refund')),
            hasLength(1));
        expect(
            deps.adapter.requests.any((r) =>
                r.uri.path.endsWith('/payments/record') ||
                r.uri.path.endsWith('/payments/initiate')),
            isFalse);

        final saved =
            (await LocalWorkspace(vault, testServer, userId).sessions())
                .singleWhere((p) => p.id == paymentId);
        expect(saved.status, 'REFUNDED');
        expect(saved.total, 150);
        expect(saved.tip, 25);
        expect(saved.metadata['receiptUrl'], url);
        expect(saved.metadata['receiptReference'], reference);
        expect(saved.metadata['verificationStatus'], 'VERIFIED');
        expect(saved.metadata['verifiedBank'], bank);
        expect(saved.metadata['verifiedAmount'], 150);

        await fixture.closeApp(tester);
        await fixture.pumpMobile(
            tester, backend, 'Cashier', '/sessions/$paymentId',
            vault: vault);
        expect(find.text('Refunded'), findsOneWidget);
        expect(find.text(url), findsOneWidget);
        expect(find.text(reference), findsOneWidget);
        expect(find.text('Record refund'), findsNothing);
      } finally {
        await fixture.closeApp(tester);
      }
    });
  }
}
