import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import '../../core/localization.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

// UI hint only: the server independently decodes and verifies the raw payload.
String? receiptBank(String value) {
  final text = value.trim();
  if (text.isEmpty || text.length > 4096) return null;
  final uri = Uri.tryParse(text);
  if (uri != null && (uri.scheme == 'https' || uri.scheme == 'http')) {
    if (uri.userInfo.isNotEmpty || text.contains('\\')) return null;
    final host = uri.host.toLowerCase();
    if ((host == 'mbreciept.cbe.com.et' || host == 'mb.cbe.com.et') &&
        !uri.hasPort &&
        uri.pathSegments.isNotEmpty) {
      return 'CBE';
    }
    if (host == 'apps.cbe.com.et' &&
        (!uri.hasPort || uri.port == 100) &&
        uri.queryParameters['id']?.isNotEmpty == true) {
      return 'CBE';
    }
    if (host == 'transactioninfo.ethiotelecom.et' &&
        !uri.hasPort &&
        uri.pathSegments.length == 2 &&
        uri.pathSegments.first == 'receipt') {
      return 'TELEBIRR';
    }
    return null;
  }
  if (RegExp(r'^FT[A-Za-z0-9]{8,12}$', caseSensitive: false).hasMatch(text)) {
    return 'CBE';
  }
  final compact = text.replaceAll(RegExp(r'\s'), '');
  if (compact.length > 1024) return null;
  String hex;
  try {
    hex = ascii.decode(base64.decode(base64.normalize(compact)));
  } on FormatException {
    hex = compact;
  }
  return hex.isNotEmpty &&
          hex.length <= 512 &&
          hex.length.isEven &&
          RegExp(r'^[A-Fa-f0-9]+$').hasMatch(hex)
      ? 'TELEBIRR'
      : null;
}

String? receiptLink(String value) {
  final text = value.trim();
  final uri = Uri.tryParse(text);
  return uri != null &&
          uri.hasScheme &&
          text.length <= 500 &&
          receiptBank(text) != null
      ? text
      : null;
}

final receiptScannerProvider =
    Provider<Future<String?> Function(BuildContext)>((_) => scanReceipt);
Future<String?> scanReceipt(BuildContext context) => Navigator.of(context)
    .push<String>(MaterialPageRoute(builder: (_) => const _ReceiptScanner()));

class _ReceiptScanner extends StatefulWidget {
  const _ReceiptScanner();
  @override
  State<_ReceiptScanner> createState() => _ReceiptScannerState();
}

class _ReceiptScannerState extends State<_ReceiptScanner>
    with WidgetsBindingObserver {
  final _controller = MobileScannerController(
      formats: const [BarcodeFormat.qrCode],
      detectionSpeed: DetectionSpeed.noDuplicates);
  bool _finished = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_finished || !_controller.value.isInitialized) return;
    if (state == AppLifecycleState.resumed) {
      unawaited(_controller.start());
    } else if (state == AppLifecycleState.inactive ||
        state == AppLifecycleState.paused) {
      unawaited(_controller.stop());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_controller.dispose());
    super.dispose();
  }

  Future<void> _detected(BarcodeCapture capture) async {
    if (_finished) return;
    for (final barcode in capture.barcodes) {
      final value = barcode.rawValue?.trim();
      if (value == null || receiptBank(value) == null) continue;
      _finished = true;
      try {
        await _controller.stop();
      } catch (_) {/* Route disposal also releases the camera. */}
      if (mounted) Navigator.pop(context, value);
      return;
    }
    if (mounted && _error == null) {
      setState(() =>
          _error = 'Scan the customer’s CBE or Telebirr transaction receipt.');
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const AppText('Scan payment receipt')),
      body: Column(children: [
        const Padding(
            padding: EdgeInsets.all(16),
            child: AppText(
                'Point the camera at the QR on the customer’s transaction receipt.')),
        Expanded(
            child: MobileScanner(
                controller: _controller,
                onDetect: _detected,
                errorBuilder: (context, error, child) => const Center(
                    child: Padding(
                        padding: EdgeInsets.all(24),
                        child: AppText(
                            'Camera unavailable. Allow camera access in phone settings, or go back and paste the receipt link.'))))),
        if (_error != null)
          Padding(padding: const EdgeInsets.all(16), child: AppText(_error!)),
      ]));
}
