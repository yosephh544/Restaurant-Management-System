import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'models.dart';

// Visual palette adapted from ui-ref; shared by all service screens.
const ink = Color(0xFF23312A);
const muted = Color(0xFF78837C);
const forest = Color(0xFF286044);
const forestDark = Color(0xFF1D4C35);
const mint = Color(0xFFE7F1E9);
const cream = Color(0xFFFBFCF9);
const lineColor = Color(0xFFE6E9E3);
const amber = Color(0xFFA56414);
const amberPale = Color(0xFFFFF1D8);
const blue = Color(0xFF385E82);
const bluePale = Color(0xFFEAF1F8);
const red = Color(0xFFA44A3E);
const redPale = Color(0xFFFAEAE7);

ThemeData serviceTheme() => ThemeData(
      useMaterial3: true,
      colorScheme:
          ColorScheme.fromSeed(seedColor: forest, brightness: Brightness.light)
              .copyWith(
                  primary: forest,
                  onPrimary: Colors.white,
                  primaryContainer: mint,
                  onPrimaryContainer: forestDark,
                  secondary: forestDark,
                  secondaryContainer: mint,
                  surface: Colors.white,
                  onSurface: ink,
                  onSurfaceVariant: muted,
                  outline: lineColor,
                  outlineVariant: lineColor,
                  error: red,
                  errorContainer: redPale),
      scaffoldBackgroundColor: cream,
      textTheme: const TextTheme(
          headlineLarge: TextStyle(
              fontSize: 32, fontWeight: FontWeight.w800, letterSpacing: -1.2),
          headlineMedium: TextStyle(
              fontSize: 28, fontWeight: FontWeight.w800, letterSpacing: -1),
          headlineSmall: TextStyle(
              fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -.8),
          titleLarge: TextStyle(
              fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: -.5),
          titleMedium: TextStyle(
              fontSize: 16, fontWeight: FontWeight.w700, letterSpacing: -.2),
          titleSmall: TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
          bodyLarge: TextStyle(fontSize: 14, color: ink, height: 1.45),
          bodyMedium: TextStyle(fontSize: 13, color: ink, height: 1.45),
          bodySmall: TextStyle(fontSize: 11, color: muted, height: 1.4),
          labelLarge: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
      appBarTheme: const AppBarTheme(
          backgroundColor: Colors.white,
          foregroundColor: ink,
          elevation: 0,
          scrolledUnderElevation: 0,
          centerTitle: false,
          titleTextStyle:
              TextStyle(color: ink, fontSize: 17, fontWeight: FontWeight.w800)),
      cardTheme: CardTheme(
          elevation: 0,
          color: Colors.white,
          margin: EdgeInsets.zero,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: const BorderSide(color: lineColor))),
      dividerTheme: const DividerThemeData(color: lineColor, thickness: 1),
      inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
          hintStyle: const TextStyle(color: muted, fontSize: 13),
          labelStyle: const TextStyle(color: muted, fontSize: 13),
          prefixIconColor: muted,
          suffixIconColor: muted,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(13)),
          enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(13),
              borderSide: const BorderSide(color: lineColor)),
          focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(13),
              borderSide: const BorderSide(color: forest, width: 1.5))),
      filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
              minimumSize: const Size(48, 48),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(13)))),
      outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
              minimumSize: const Size(48, 48),
              foregroundColor: forestDark,
              backgroundColor: const Color(0xFFF5F9F5),
              side: const BorderSide(color: Color(0xFFDCE5DD)),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(13)))),
      segmentedButtonTheme: SegmentedButtonThemeData(
          style: ButtonStyle(
              side: const WidgetStatePropertyAll(BorderSide(color: lineColor)),
              shape: WidgetStatePropertyAll(RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(13))))),
      dialogTheme: DialogTheme(
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
      snackBarTheme: SnackBarThemeData(
          backgroundColor: ink,
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(13))),
      navigationBarTheme: const NavigationBarThemeData(
          backgroundColor: Colors.white, indicatorColor: mint),
    );

class BrandMark extends StatelessWidget {
  final double size;
  const BrandMark({this.size = 36, super.key});
  @override
  Widget build(BuildContext context) => Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
          color: forest, borderRadius: BorderRadius.circular(size * .3)),
      child: Icon(Icons.restaurant, color: Colors.white, size: size * .52));
}

class Eyebrow extends StatelessWidget {
  final String text;
  const Eyebrow(this.text, {super.key});
  @override
  Widget build(BuildContext context) => Text(text.toUpperCase(),
      style: const TextStyle(
          color: muted,
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.1));
}

class ScreenHeading extends StatelessWidget {
  final String eyebrow, title, subtitle;
  final Widget? action;
  const ScreenHeading(
      {required this.eyebrow,
      required this.title,
      this.subtitle = '',
      this.action,
      super.key});
  @override
  Widget build(BuildContext context) {
    final copy =
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Eyebrow(eyebrow),
      const SizedBox(height: 6),
      Text(title, style: Theme.of(context).textTheme.headlineSmall),
      if (subtitle.isNotEmpty) ...[
        const SizedBox(height: 7),
        Text(subtitle, style: const TextStyle(color: muted, fontSize: 13)),
      ],
    ]);
    return LayoutBuilder(builder: (context, constraints) {
      if (action == null) return copy;
      if (constraints.maxWidth < 420 ||
          MediaQuery.textScalerOf(context).scale(1) > 1.3) {
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          copy,
          const SizedBox(height: 14),
          action!,
        ]);
      }
      return Row(children: [
        Expanded(child: copy),
        const SizedBox(width: 16),
        action!,
      ]);
    });
  }
}

class SectionHeading extends StatelessWidget {
  final String title;
  final String? eyebrow, detail;
  const SectionHeading(this.title, {this.eyebrow, this.detail, super.key});
  @override
  Widget build(BuildContext context) => Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 12,
          runSpacing: 8,
          children: [
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (eyebrow != null) ...[
                Eyebrow(eyebrow!),
                const SizedBox(height: 4)
              ],
              Text(title, style: Theme.of(context).textTheme.titleMedium),
            ]),
            if (detail != null)
              Text(detail!, style: const TextStyle(color: muted, fontSize: 11)),
          ]));
}

class ServiceStat extends StatelessWidget {
  final String label, hint;
  final int value;
  final bool accent;
  const ServiceStat(this.label, this.value, this.hint,
      {this.accent = false, super.key});
  @override
  Widget build(BuildContext context) => Container(
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
          color: accent ? const Color(0xFFF0F7F1) : Colors.white,
          border:
              Border.all(color: accent ? const Color(0xFFDBE9DE) : lineColor),
          borderRadius: BorderRadius.circular(16)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label,
            style: const TextStyle(
                color: muted, fontSize: 11, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Text('$value',
            style: const TextStyle(
                color: ink,
                fontSize: 25,
                fontWeight: FontWeight.w800,
                height: 1)),
        const SizedBox(height: 6),
        Text(hint, style: const TextStyle(color: muted, fontSize: 10)),
      ]));
}

class StatRow extends StatelessWidget {
  final List<ServiceStat> stats;
  const StatRow(this.stats, {super.key});
  @override
  Widget build(BuildContext context) =>
      LayoutBuilder(builder: (context, constraints) {
        final columns = constraints.maxWidth < 280 ||
                MediaQuery.textScalerOf(context).scale(1) > 1.3
            ? 1
            : stats.length;
        return Wrap(spacing: 10, runSpacing: 10, children: [
          for (final stat in stats)
            SizedBox(
                width: (constraints.maxWidth - (columns - 1) * 10) / columns,
                child: stat),
        ]);
      });
}

class OrderHeading extends StatelessWidget {
  final String number, table, status;
  final String? subtitle;
  const OrderHeading(
      {required this.number,
      required this.table,
      required this.status,
      this.subtitle,
      super.key});
  @override
  Widget build(BuildContext context) {
    final copy =
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Eyebrow(number),
      const SizedBox(height: 6),
      Text('Table $table', style: Theme.of(context).textTheme.titleLarge),
    ]);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      LayoutBuilder(
          builder: (context, constraints) => constraints.maxWidth < 280 ||
                  MediaQuery.textScalerOf(context).scale(1) > 1.3
              ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  copy,
                  const SizedBox(height: 8),
                  StatusBadge(status),
                ])
              : Row(children: [
                  Expanded(child: copy),
                  const SizedBox(width: 12),
                  StatusBadge(status),
                ])),
      if (subtitle != null && subtitle!.isNotEmpty) ...[
        const SizedBox(height: 7),
        Text(subtitle!, style: const TextStyle(color: muted, fontSize: 12)),
      ],
    ]);
  }
}

class QuantityButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;
  final bool add;
  const QuantityButton(
      {required this.icon,
      required this.tooltip,
      required this.onPressed,
      this.add = false,
      super.key});
  @override
  Widget build(BuildContext context) => IconButton(
      tooltip: tooltip,
      onPressed: onPressed,
      style: IconButton.styleFrom(
          minimumSize: const Size(44, 44),
          foregroundColor: add ? forestDark : muted,
          backgroundColor: add ? mint : Colors.white,
          side: const BorderSide(color: lineColor),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(11))),
      icon: Icon(icon, size: 18));
}

class StatusBadge extends StatelessWidget {
  final String status;
  const StatusBadge(this.status, {super.key});
  @override
  Widget build(BuildContext context) {
    final c = code(status);
    final (color, background) = c.contains('CANCEL') || c == 'FAILED'
        ? (red, redPale)
        : switch (c) {
            'PENDING' || 'NOTSUBMITTED' => (blue, bluePale),
            'PREPARING' ||
            'PAYMENTINITIATED' ||
            'INITIATED' ||
            'REFUNDPENDING' =>
              (amber, amberPale),
            'READY' || 'PAID' || 'PAIDOUT' => (forestDark, mint),
            _ => (const Color(0xFF5F6C62), const Color(0xFFEEF0ED)),
          };
    return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
            color: background, borderRadius: BorderRadius.circular(99)),
        child: Text(statusLabel(status),
            style: TextStyle(
                color: color, fontWeight: FontWeight.w700, fontSize: 11)));
  }
}

class Notice extends StatelessWidget {
  final String text;
  final bool error;
  const Notice(this.text, {this.error = false, super.key});
  @override
  Widget build(BuildContext context) => Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
          color: error ? redPale : amberPale,
          borderRadius: BorderRadius.circular(14)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(error ? Icons.error_outline : Icons.info_outline,
            size: 18, color: error ? red : amber),
        const SizedBox(width: 10),
        Expanded(child: Text(text)),
      ]));
}

class EmptyState extends StatelessWidget {
  final String title, message;
  final IconData icon;
  final Widget? action;
  const EmptyState(this.title, this.message,
      {this.icon = Icons.inbox_outlined, this.action, super.key});
  @override
  Widget build(BuildContext context) => Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
      decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: lineColor),
          borderRadius: BorderRadius.circular(18)),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
            padding: const EdgeInsets.all(13),
            decoration: BoxDecoration(
                color: mint, borderRadius: BorderRadius.circular(15)),
            child: Icon(icon, size: 24, color: forest)),
        const SizedBox(height: 16),
        Text(title,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleMedium),
        if (message.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: muted)),
        ],
        if (action != null) ...[const SizedBox(height: 20), action!],
      ]));
}

void showError(BuildContext context, Object error) {
  ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('$error'), duration: const Duration(seconds: 6)));
}

Future<bool> confirmAction(
        BuildContext context, String title, String message) async =>
    await showDialog<bool>(
        context: context,
        builder: (c) =>
            AlertDialog(title: Text(title), content: Text(message), actions: [
              TextButton(
                  onPressed: () => Navigator.pop(c, false),
                  child: const Text('Cancel')),
              FilledButton(
                  onPressed: () => Navigator.pop(c, true),
                  child: const Text('Confirm')),
            ])) ??
    false;

class PageButtons extends StatelessWidget {
  final int page, pages, total;
  final void Function(int) onPage;
  const PageButtons(
      {required this.page,
      required this.pages,
      required this.total,
      required this.onPage,
      super.key});
  @override
  Widget build(BuildContext context) => pages <= 1
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Row(children: [
            Expanded(
                child: Text('$page / $pages',
                    style: const TextStyle(color: muted))),
            IconButton(
                tooltip: 'Previous page',
                onPressed: page > 1 ? () => onPage(page - 1) : null,
                icon: const Icon(Icons.chevron_left)),
            IconButton(
                tooltip: 'Next page',
                onPressed: page < pages ? () => onPage(page + 1) : null,
                icon: const Icon(Icons.chevron_right)),
          ]));
}

/// Refreshes only a visible, resumed route; preserves data on transient failures.
class AsyncPane<T> extends StatefulWidget {
  final Future<T> Function() load;
  final Widget Function(T, VoidCallback) builder;
  final Duration? interval;
  final Object? loadKey;
  final bool Function(T)? keepPolling;
  const AsyncPane(
      {required this.load,
      required this.builder,
      this.interval,
      this.loadKey,
      this.keepPolling,
      super.key});
  @override
  State<AsyncPane<T>> createState() => _AsyncPaneState<T>();
}

class _AsyncPaneState<T> extends State<AsyncPane<T>>
    with WidgetsBindingObserver {
  T? _data;
  Object? _error;
  DateTime? _updated;
  bool _busy = false, _resumed = true;
  int _generation = 0, _failures = 0;
  Timer? _timer;
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_load());
  }

  @override
  void didUpdateWidget(covariant AsyncPane<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.loadKey != widget.loadKey) {
      _generation++;
      _busy = false;
      _data = null;
      _error = null;
      _updated = null;
      _failures = 0;
      _timer?.cancel();
      unawaited(_load());
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _resumed = state == AppLifecycleState.resumed;
    _timer?.cancel();
    if (_resumed) unawaited(_load());
  }

  void _schedule() {
    _timer?.cancel();
    if (!mounted ||
        !_resumed ||
        widget.interval == null ||
        (_data != null && widget.keepPolling?.call(_data as T) == false)) {
      return;
    }
    final seconds = widget.interval!.inSeconds * (1 << _failures.clamp(0, 3));
    _timer = Timer(Duration(seconds: seconds.clamp(1, 30)), () {
      if (ModalRoute.of(context)?.isCurrent != false) {
        unawaited(_load());
      } else {
        _schedule();
      }
    });
  }

  Future<void> _load() async {
    if (_busy || !mounted || !_resumed) return;
    final generation = _generation;
    setState(() => _busy = true);
    try {
      final value = await widget.load();
      if (!mounted || generation != _generation) return;
      setState(() {
        _data = value;
        _error = null;
        _updated = DateTime.now();
        _failures = 0;
      });
    } catch (e) {
      if (!mounted || generation != _generation) return;
      setState(() {
        _error = e;
        _failures++;
      });
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _busy = false);
        _schedule();
      }
    }
  }

  @override
  void dispose() {
    _generation++;
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_data == null) {
      if (_error != null) {
        return EmptyState('Unable to load', '$_error',
            icon: Icons.wifi_off,
            action: FilledButton.icon(
                onPressed: () => unawaited(_load()),
                icon: const Icon(Icons.refresh),
                label: const Text('Try again')));
      }
      return const Padding(
          padding: EdgeInsets.all(48),
          child: Center(child: CircularProgressIndicator()));
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      if (_busy) const LinearProgressIndicator(minHeight: 2),
      if (_error != null)
        Notice(
            'Last updated ${_updated == null ? 'earlier' : DateFormat.Hm().format(_updated!)}. $_error',
            error: true),
      Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(children: [
            const Icon(Icons.sync, size: 14, color: forest),
            const SizedBox(width: 6),
            Expanded(
                child: Text(
                    '${widget.interval != null && widget.keepPolling?.call(_data as T) != false ? 'Auto refresh' : 'Updated'}${_updated == null ? '' : ' · ${DateFormat.Hm().format(_updated!)}'}',
                    style: const TextStyle(color: muted, fontSize: 11))),
            IconButton(
                tooltip: 'Refresh',
                onPressed: _busy ? null : () => unawaited(_load()),
                icon: const Icon(Icons.refresh, size: 18)),
          ])),
      widget.builder(_data as T, () => unawaited(_load())),
    ]);
  }
}

class ScreenBody extends StatelessWidget {
  final Widget child;
  const ScreenBody({required this.child, super.key});
  @override
  Widget build(BuildContext context) => SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
          16, 20, 16, 24 + MediaQuery.viewInsetsOf(context).bottom),
      child: Center(
          child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 960), child: child)));
}

class Totals extends StatelessWidget {
  final double subtotal, tax, tip, total;
  final bool estimate;
  const Totals(
      {required this.subtotal,
      required this.tax,
      required this.tip,
      required this.total,
      this.estimate = false,
      super.key});
  @override
  Widget build(BuildContext context) => Card(
      child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(children: [
            for (final row in [
              ('Subtotal', subtotal),
              ('Tax', tax),
              ('Tip', tip)
            ])
              Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [Text(row.$1), Text(money(row.$2))])),
            const Divider(),
            const SizedBox(height: 8),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
              Text(estimate ? 'Estimated total' : 'Order total',
                  style: const TextStyle(fontWeight: FontWeight.bold)),
              Text(money(total),
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontWeight: FontWeight.w800)),
            ]),
          ])));
}
