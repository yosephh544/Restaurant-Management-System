import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api.dart';
import '../../core/models.dart';
import '../../core/permissions.dart';
import '../../core/session.dart';
import '../../core/widgets.dart';

class CartPage extends ConsumerStatefulWidget {
  final String? orderId, itemId;
  final bool replacement;
  const CartPage(
      {this.orderId, this.itemId, this.replacement = false, super.key});
  @override
  ConsumerState<CartPage> createState() => _CartPageState();
}

class _CartPageState extends ConsumerState<CartPage> {
  final _form = GlobalKey<FormState>();
  final _table = TextEditingController(), _note = TextEditingController();
  final _searchController = TextEditingController();
  final _menuScroll = ScrollController();
  final List<DraftLine> _lines = [];
  List<MenuCategory> _menu = [];
  LocalWorkspace? _workspace;
  RestaurantOrder? _original;
  Json? _otherDraft;
  String _search = '';
  String? _categoryId;
  bool _reviewing = false;
  String? _error;
  bool _loading = true, _busy = false, _uncertain = false, _loaded = false;
  Timer? _saveTimer;
  String get _route => widget.orderId == null
      ? '/orders/new'
      : '/orders/${widget.orderId}/${widget.replacement ? 'replace' : 'add'}';
  @override
  void initState() {
    super.initState();
    _workspace = ref.read(sessionProvider.notifier).workspace;
    unawaited(_load());
  }

  Json _draft() => {
        'route': _route,
        'table': _table.text,
        'note': _note.text,
        'uncertain': _uncertain,
        'lines': _lines.map((l) => l.toJson()).toList()
      };
  void _saveSoon() {
    _saveTimer?.cancel();
    _saveTimer = Timer(const Duration(milliseconds: 400), _save);
  }

  void _save() {
    if (!_loaded || _otherDraft != null || _workspace == null) return;
    unawaited(_workspace!.saveDraft(_draft()).catchError((Object e) {
      if (mounted) {
        setState(() => _error =
            'Your draft could not be saved on this device. Keep this screen open until submission.');
      }
    }));
  }

  Future<void> _load({bool discard = false}) async {
    if (mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final access = ref.read(sessionProvider).session!.staff;
      final canPrepare = widget.orderId == null
          ? access.canCreateOrders
          : widget.replacement
              ? access.canReplaceOrders
              : access.canAddItems;
      if (!canPrepare)
        throw const ApiException(
            'You do not have permission to prepare this order.');
      if (discard) await _workspace?.clearDraft();
      final draft = await _workspace?.draft();
      if (draft != null && draft['route'] != _route) {
        if (mounted) {
          setState(() {
            _otherDraft = draft;
            _loading = false;
          });
        }
        return;
      }
      _menu = await ref.read(restaurantApiProvider).menu();
      if (widget.orderId != null) {
        _original =
            await ref.read(restaurantApiProvider).order(widget.orderId!);
        final staff = ref.read(sessionProvider).session!.staff;
        if (!staff.ownsOrOversees(_original!) ||
            !staff.can(widget.replacement ? P.ordersReorder : P.ordersAdd)) {
          throw const ApiException(
              'Only the assigned waiter can change this order.');
        }
        if (widget.replacement
            ? (!_original!.cancelled || _original!.paid)
            : !_original!.canAdd) {
          throw const ApiException(
              'This order cannot be changed in its current state.');
        }
        _table.text = _original!.table;
      }
      if (draft != null) {
        _table.text = draft['table'] as String? ?? _table.text;
        _note.text = draft['note'] as String? ?? '';
        _uncertain = draft['uncertain'] == true;
        _lines.clear();
        final current = {
          for (final c in _menu)
            for (final i in c.items) i.id: i
        };
        for (final value in draft['lines'] as List? ?? []) {
          final line = DraftLine.fromJson(jsonObject(value));
          final item = current[line.item.id];
          _lines.add(DraftLine(
              item ??
                  MenuItem(
                      id: line.item.id,
                      categoryId: line.item.categoryId,
                      name: line.item.name,
                      price: line.item.price,
                      taxRate: line.item.taxRate,
                      available: false),
              line.quantity,
              line.note));
        }
      }
      if (widget.itemId != null &&
          !_lines.any((l) => l.item.id == widget.itemId)) {
        final matches = _menu
            .expand((c) => c.items)
            .where((i) => i.id == widget.itemId && i.available);
        if (matches.isNotEmpty) _lines.add(DraftLine(matches.first, 1, ''));
      }
      if (mounted) {
        setState(() {
          _otherDraft = null;
          _loading = false;
          _loaded = true;
        });
      }
      _saveSoon();
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '$e';
          _loading = false;
        });
      }
    }
  }

  @override
  void dispose() {
    _saveTimer?.cancel();
    if (!_busy) _save();
    _table.dispose();
    _note.dispose();
    _searchController.dispose();
    _menuScroll.dispose();
    super.dispose();
  }

  void _add(MenuItem item) {
    if (!item.available || _busy) return;
    setState(() {
      final index = _lines.indexWhere((l) => l.item.id == item.id);
      if (index < 0) {
        _lines.add(DraftLine(item, 1, ''));
      } else if (_lines[index].quantity < 100) {
        _lines[index] =
            _lines[index].copy(quantity: _lines[index].quantity + 1);
      }
    });
    _saveSoon();
  }

  void _showReview(bool review) {
    FocusScope.of(context).unfocus();
    setState(() => _reviewing = review);
  }

  void _resetMenuScroll() {
    if (_menuScroll.hasClients) _menuScroll.jumpTo(0);
  }

  Future<void> _editNote(int index) async {
    var noteText = _lines[index].note;
    final result = await showDialog<String>(
        context: context,
        builder: (c) => AlertDialog(
                title: Text(_lines[index].item.name),
                content: TextFormField(
                    initialValue: noteText,
                    onChanged: (v) => noteText = v,
                    maxLength: 500,
                    maxLines: 3,
                    decoration: const InputDecoration(
                        labelText: 'Notes', counterText: '')),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(c),
                      child: const Text('Cancel')),
                  FilledButton(
                      onPressed: () => Navigator.pop(c, noteText.trim()),
                      child: const Text('Save'))
                ]));
    if (result != null && mounted) {
      setState(() => _lines[index] = _lines[index].copy(note: result));
      _saveSoon();
    }
  }

  Future<void> _submit() async {
    if (_busy ||
        _uncertain ||
        !_form.currentState!.validate() ||
        _lines.isEmpty) {
      return;
    }
    if (_lines.any((l) =>
        !l.item.available ||
        l.quantity < 1 ||
        l.quantity > 100 ||
        l.note.length > 500)) {
      setState(() => _error =
          'Remove unavailable items and check the quantities before submitting.');
      return;
    }
    _saveTimer?.cancel();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final access = ref.read(sessionProvider).session!.staff;
      final canPrepare = widget.orderId == null
          ? access.canCreateOrders
          : widget.replacement
              ? access.canReplaceOrders
              : access.canAddItems;
      if (!canPrepare)
        throw const ApiException('Order permission is required.');
      if (widget.orderId != null) {
        final current =
            await ref.read(restaurantApiProvider).order(widget.orderId!);
        if (widget.replacement
            ? (!current.cancelled || current.paid)
            : !current.canAdd) {
          throw const ApiException(
              'The order changed. Check its current status before continuing.');
        }
      }
      final body = <String, dynamic>{
        'items': _lines.map((l) => l.toRequest()).toList(),
        if (widget.orderId == null || widget.replacement) ...{
          'tableNumber': _table.text.trim(),
          'customerNotes': _note.text.trim().isEmpty ? null : _note.text.trim()
        },
        if (widget.replacement) ...{
          'parentOrderId': widget.orderId,
        },
      };
      // Keep an in-flight draft protected even if the process terminates.
      await _workspace?.saveDraft({..._draft(), 'uncertain': true});
      final order = await ref.read(restaurantApiProvider).submitOrder(body,
          orderId: widget.orderId, replacement: widget.replacement);
      _loaded = false;
      try {
        await _workspace?.clearDraft();
      } catch (_) {
        /* The successful server order must never be submitted again. */
      }
      if (mounted) context.go('/orders/${order.id}');
    } catch (e) {
      _uncertain = e is ApiException ? e.uncertain : true;
      if (mounted) {
        setState(() {
          _error = '$e';
          _busy = false;
        });
      }
      _save();
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.watch(sessionProvider);
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_otherDraft != null) {
      return ScreenBody(
          child: EmptyState('Unsent order', '',
              icon: Icons.edit_note,
              action: Column(children: [
                FilledButton(
                    onPressed: () =>
                        context.go(_otherDraft!['route'] as String),
                    child: const Text('Resume')),
                TextButton(
                    onPressed: () async {
                      if (await confirmAction(context, 'Discard order?',
                          'Remove these unsent items and notes?')) {
                        await _load(discard: true);
                      }
                    },
                    child: const Text('Discard'))
              ])));
    }
    if (!_loaded) {
      return ScreenBody(
          child: EmptyState(
              'Unable to load order', _error ?? 'Check the server connection.',
              action: FilledButton(
                  onPressed: _load, child: const Text('Try again'))));
    }
    final cart = Form(
        key: _form,
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Card(
              child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                            widget.replacement
                                ? 'Replacement order'
                                : widget.orderId != null
                                    ? 'Add to ${_original?.orderNumber}'
                                    : 'Order',
                            style: Theme.of(context)
                                .textTheme
                                .titleLarge
                                ?.copyWith(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 6),
                        Text(
                            '${_lines.fold<int>(0, (count, line) => count + line.quantity)} items selected',
                            style: const TextStyle(color: muted, fontSize: 12)),
                        const SizedBox(height: 18),
                        if (widget.orderId == null || widget.replacement) ...[
                          TextFormField(
                              controller: _table,
                              enabled: !_busy,
                              maxLength: 20,
                              decoration: const InputDecoration(
                                  labelText: 'Table',
                                  hintText: 'Table or takeaway',
                                  counterText: ''),
                              onChanged: (_) => _saveSoon(),
                              validator: (v) => v == null || v.trim().isEmpty
                                  ? 'Enter a table or counter.'
                                  : null),
                          const SizedBox(height: 12),
                          TextFormField(
                              controller: _note,
                              enabled: !_busy,
                              maxLength: 500,
                              maxLines: 2,
                              decoration: const InputDecoration(
                                  labelText: 'Notes (optional)',
                                  counterText: ''),
                              onChanged: (_) => _saveSoon()),
                        ],
                        if (_lines.isEmpty)
                          const Padding(
                              padding: EdgeInsets.symmetric(vertical: 20),
                              child: Text('No items selected')),
                        for (var index = 0; index < _lines.length; index++)
                          _cartLine(index),
                      ]))),
          if (_error != null && !_uncertain) Notice(_error!, error: true),
          if (_uncertain) ...[
            const Notice('Check Orders before sending this order again.'),
            OutlinedButton(
                onPressed: () => context.go('/orders'),
                child: const Text('View orders')),
            TextButton(
                onPressed: () async {
                  if (await confirmAction(context, 'Submit again?',
                      'Confirm this order was not already created.')) {
                    if (mounted) setState(() => _uncertain = false);
                    _saveSoon();
                  }
                },
                child: const Text('I checked'))
          ],
        ]));
    final submitButton = FilledButton.icon(
        onPressed: _busy ||
                _uncertain ||
                _lines.isEmpty ||
                _lines.any((l) => !l.item.available)
            ? null
            : _submit,
        icon: const Icon(Icons.send_outlined),
        label: Text(_busy
            ? 'Sending…'
            : widget.orderId != null && !widget.replacement
                ? 'Add items'
                : 'Send to kitchen'));
    final menuItems = _menu
        .expand((c) => c.items)
        .where((i) =>
            (_categoryId == null || i.categoryId == _categoryId) &&
            '${i.name} ${i.description} ${i.categoryName}'
                .toLowerCase()
                .contains(_search))
        .toList();
    final itemCount =
        _lines.fold<int>(0, (count, line) => count + line.quantity);
    final menuHeader = Padding(
        padding: const EdgeInsets.fromLTRB(16, 5, 16, 8),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (MediaQuery.viewInsetsOf(context).bottom == 0) ...[
            ScreenHeading(
                eyebrow: widget.replacement
                    ? 'Waiter · Replacement'
                    : widget.orderId != null
                        ? 'Waiter · Add items'
                        : 'Waiter · New order',
                title: widget.replacement
                    ? 'A fresh order'
                    : widget.orderId != null
                        ? 'Add to the table'
                        : 'Start an order',
                subtitle: 'Choose dishes and add any preparation notes.'),
            const SizedBox(height: 12),
          ],
          TextField(
              controller: _searchController,
              enabled: !_busy,
              onChanged: (v) {
                setState(() => _search = v.toLowerCase().trim());
                _resetMenuScroll();
              },
              decoration: InputDecoration(
                  hintText: 'Search dishes',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _searchController.text.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Clear search',
                          onPressed: () {
                            _searchController.clear();
                            setState(() => _search = '');
                            _resetMenuScroll();
                          },
                          icon: const Icon(Icons.close)))),
          const SizedBox(height: 8),
          SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(children: [
                Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                        label: const Text('All Items'),
                        selected: _categoryId == null,
                        labelStyle: TextStyle(
                            color: _categoryId == null ? Colors.white : ink),
                        onSelected: _busy
                            ? null
                            : (_) {
                                setState(() => _categoryId = null);
                                _resetMenuScroll();
                              })),
                for (final category in _menu.where((c) => c.items.isNotEmpty))
                  Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ChoiceChip(
                          label: Text(category.name),
                          selected: _categoryId == category.id,
                          labelStyle: TextStyle(
                              color: _categoryId == category.id
                                  ? Colors.white
                                  : ink),
                          onSelected: _busy
                              ? null
                              : (selected) {
                                  setState(() => _categoryId =
                                      selected ? category.id : null);
                                  _resetMenuScroll();
                                })),
              ])),
          const SizedBox(height: 8),
          Row(children: [
            const Expanded(
                child: Text('Dishes',
                    style: TextStyle(fontWeight: FontWeight.w700))),
            Text(
                '${menuItems.length} ${menuItems.length == 1 ? 'dish' : 'dishes'}',
                style: const TextStyle(color: muted, fontSize: 12)),
          ]),
        ]));
    final menu = CustomScrollView(
        key: PageStorageKey('$_route/dishes'),
        controller: _menuScroll,
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        slivers: [
          SliverToBoxAdapter(child: menuHeader),
          if (menuItems.isEmpty)
            const SliverPadding(
                padding: EdgeInsets.all(16),
                sliver: SliverToBoxAdapter(
                    child: EmptyState(
                        'No dishes found', 'Try another search or category.')))
          else
            SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                sliver: SliverList(
                    delegate: SliverChildBuilderDelegate((context, index) {
                  if (index.isOdd) return const SizedBox(height: 8);
                  final item = menuItems[index ~/ 2];
                  final quantity = _lines
                      .where((line) => line.item.id == item.id)
                      .fold<int>(0, (count, line) => count + line.quantity);
                  return Card(
                      color: Colors.white,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                          side: BorderSide(
                              color: quantity > 0
                                  ? const Color(0xFF9FBEA3)
                                  : lineColor)),
                      child: InkWell(
                          borderRadius: BorderRadius.circular(16),
                          onTap: item.available && !_busy
                              ? () => _add(item)
                              : null,
                          child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Row(children: [
                                Expanded(
                                    child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                      if (item.categoryName.isNotEmpty) ...[
                                        Text(item.categoryName,
                                            style: const TextStyle(
                                                color: muted, fontSize: 10)),
                                        const SizedBox(height: 4),
                                      ],
                                      Text(item.name,
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w700,
                                              fontSize: 15)),
                                      if (item.description.isNotEmpty) ...[
                                        const SizedBox(height: 4),
                                        Text(item.description,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                                color: muted, fontSize: 11)),
                                      ],
                                      const SizedBox(height: 6),
                                      Text(
                                          item.available
                                              ? money(item.price)
                                              : 'Unavailable',
                                          style: TextStyle(
                                              color: item.available
                                                  ? forestDark
                                                  : red,
                                              fontWeight: FontWeight.w700,
                                              fontSize: 15)),
                                    ])),
                                const SizedBox(width: 10),
                                if (quantity > 0) ...[
                                  Text('$quantity',
                                      style: const TextStyle(
                                          color: forestDark,
                                          fontWeight: FontWeight.w700)),
                                  const SizedBox(width: 8),
                                ],
                                QuantityButton(
                                    tooltip: 'Add ${item.name}',
                                    onPressed: item.available && !_busy
                                        ? () => _add(item)
                                        : null,
                                    add: true,
                                    icon: Icons.add),
                              ]))));
                }, childCount: menuItems.length * 2 - 1))),
        ]);
    return PopScope(
        canPop: !_reviewing && !_busy,
        onPopInvokedWithResult: (didPop, result) {
          if (!didPop && _reviewing && !_busy) _showReview(false);
        },
        child: Center(
            child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 960),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (_reviewing)
                        Expanded(
                            child: ScreenBody(
                                child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.stretch,
                                    children: [
                              Align(
                                  alignment: Alignment.centerLeft,
                                  child: TextButton.icon(
                                      onPressed: _busy
                                          ? null
                                          : () => _showReview(false),
                                      icon: const Icon(Icons.arrow_back),
                                      label: const Text('Back to dishes'))),
                              cart,
                            ])))
                      else
                        Expanded(child: menu),
                      Container(
                          padding: const EdgeInsets.all(16),
                          decoration: const BoxDecoration(
                              color: Colors.white,
                              border:
                                  Border(top: BorderSide(color: lineColor))),
                          child: _reviewing
                              ? submitButton
                              : Row(children: [
                                  Expanded(
                                      child: Column(
                                          crossAxisAlignment:
                                              CrossAxisAlignment.start,
                                          mainAxisSize: MainAxisSize.min,
                                          children: [
                                        Text(
                                            itemCount == 0
                                                ? 'Add dishes'
                                                : '$itemCount ${itemCount == 1 ? 'item' : 'items'}',
                                            style: const TextStyle(
                                                fontWeight: FontWeight.w800,
                                                fontSize: 18)),
                                        const SizedBox(height: 3),
                                        Text(
                                            itemCount == 0
                                                ? 'Tap + to select'
                                                : 'Selected items',
                                            style: const TextStyle(
                                                color: muted, fontSize: 11)),
                                      ])),
                                  const SizedBox(width: 12),
                                  FilledButton.icon(
                                      onPressed: _busy || _lines.isEmpty
                                          ? null
                                          : () => _showReview(true),
                                      icon: const Icon(Icons.arrow_forward),
                                      label: const Text('Review order')),
                                ])),
                    ]))));
  }

  Widget _cartLine(int index) {
    final line = _lines[index];
    return Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
                child: Text(line.item.name,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 16))),
            IconButton(
                tooltip: 'Remove ${line.item.name}',
                onPressed: _busy
                    ? null
                    : () {
                        setState(() => _lines.removeAt(index));
                        _saveSoon();
                      },
                icon: const Icon(Icons.delete_outline))
          ]),
          if (!line.item.available)
            const Text('Unavailable', style: TextStyle(color: red)),
          if (line.note.isNotEmpty)
            Text(line.note, style: const TextStyle(color: muted)),
          const SizedBox(height: 8),
          Row(children: [
            QuantityButton(
                tooltip: 'Decrease quantity',
                onPressed: _busy || line.quantity <= 1
                    ? null
                    : () {
                        setState(() => _lines[index] =
                            line.copy(quantity: line.quantity - 1));
                        _saveSoon();
                      },
                icon: Icons.remove),
            const SizedBox(width: 12),
            Text('${line.quantity}',
                style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(width: 12),
            QuantityButton(
                tooltip: 'Increase quantity',
                onPressed: _busy || line.quantity >= 100
                    ? null
                    : () {
                        setState(() => _lines[index] =
                            line.copy(quantity: line.quantity + 1));
                        _saveSoon();
                      },
                add: true,
                icon: Icons.add),
          ]),
          TextButton.icon(
              onPressed: _busy ? null : () => _editNote(index),
              icon: const Icon(Icons.edit_note),
              label: const Text('Notes')),
          const Divider(),
        ]));
  }
}
