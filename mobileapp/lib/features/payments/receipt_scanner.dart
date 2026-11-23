import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

String? receiptLink(String value) {
  final text = value.trim();
  final uri = Uri.tryParse(text);
  return uri != null &&
          uri.host.isNotEmpty &&
          (uri.scheme == 'https' || uri.scheme == 'http') &&
          text.length <= 500
      ? text
      : null;
}

Future<String?> scanReceipt(BuildContext context) => Navigator.of(context)
    .push<String>(MaterialPageRoute(builder: (_) => const _ReceiptScanner()));

class _ReceiptScanner extends StatefulWidget {
  const _ReceiptScanner();
  @override
  State<_ReceiptScanner> createState() => _ReceiptScannerState();
}

class _ReceiptScannerState extends State<_ReceiptScanner> {
  bool _finished = false;
  String? _error;

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Scan payment receipt')),
      body: Column(children: [
        const Padding(
            padding: EdgeInsets.all(16),
            child: Text(
                'Point the camera at the QR on the customer’s transaction receipt.')),
        Expanded(
            child: MobileScanner(
          onDetect: (capture) {
            if (_finished) return;
            for (final barcode in capture.barcodes) {
              final value = barcode.rawValue;
              if (value == null) continue;
              final link = receiptLink(value);
              if (link != null) {
                _finished = true;
                Navigator.pop(context, link);
                return;
              }
            }
            if (_error == null) {
              setState(() => _error =
                  'This QR does not contain a receipt link. Try the transaction receipt.');
            }
          },
          errorBuilder: (context, error, child) => const Center(
              child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                      'Camera unavailable. Allow camera access in phone settings, or go back and paste the receipt link.'))),
        )),
        if (_error != null)
          Padding(padding: const EdgeInsets.all(16), child: Text(_error!)),
      ]));
}
