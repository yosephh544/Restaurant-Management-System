import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api.dart';
import '../../core/billing.dart';
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
  List<RestaurantTable> _tables = [];
  LocalWorkspace? _workspace;
  RestaurantOrder? _original;
  Json? _otherDraft;
  String _search = '';
  String _orderType = 'DINE_IN';
  bool get _takeaway => _orderType != 'DINE_IN';
  bool get _takeout => _orderType == 'TAKEOUT';
  String? _categoryId;
  bool _reviewing = false;
  bool _refreshing = false;
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
        'orderType': _orderType,
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
      if (!canPrepare) {
        throw const ApiException(
            'You do not have permission to prepare this order.');
      }
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
      if (widget.orderId == null || widget.replacement) {
        _tables = access.can(P.tablesView)
            ? await ref.read(restaurantApiProvider).tables()
            : [];
      }
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
        _orderType = code(_original!.orderType);
      }
      if (draft != null) {
        _table.text = draft['table'] as String? ?? _table.text;
        if (draft['orderType'] != null) {
          _orderType = code(draft['orderType'] as String);
        }
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
                      nameAm: line.item.nameAm,
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

  Future<void> _refreshMenu() async {
    if (_busy || _refreshing || !_loaded || _otherDraft != null) return;
    setState(() => _refreshing = true);
    final api = ref.read(restaurantApiProvider);
    final account = ref.read(sessionProvider).session?.staff.id;
    try {
      final menu = await api.menu();
      final tables = (widget.orderId == null || widget.replacement) &&
              ref.read(sessionProvider).session!.staff.can(P.tablesView)
          ? await api.tables()
          : _tables;
      if (!mounted ||
          _workspace?.active != true ||
          ref.read(sessionProvider).session?.staff.id != account) {
        return;
      }
      final current = {
        for (final category in menu)
          for (final item in category.items) item.id: item
      };
      setState(() {
        _menu = menu;
        _tables = tables;
        if (_categoryId != null && !menu.any((c) => c.id == _categoryId)) {
          _categoryId = null;
        }
        for (var index = 0; index < _lines.length; index++) {
          final line = _lines[index];
          final item = current[line.item.id] ??
              MenuItem(
                  id: line.item.id,
                  categoryId: line.item.categoryId,
                  name: line.item.name,
                  nameAm: line.item.nameAm,
                  description: line.item.description,
                  categoryName: line.item.categoryName,
                  image: line.item.image,
                  price: line.item.price,
                  taxRate: line.item.taxRate,
                  available: false);
          _lines[index] = DraftLine(item, line.quantity, line.note);
        }
      });
      _saveSoon();
    } catch (e) {
      if (mounted) showError(context, e);
    } finally {
      if (mounted) setState(() => _refreshing = false);
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

  void _decrease(MenuItem item) {
    if (_busy) return;
    final index = _lines.indexWhere((line) => line.item.id == item.id);
    if (index < 0) return;
    setState(() {
      final line = _lines[index];
      if (line.quantity <= 1) {
        _lines.removeAt(index);
      } else {
        _lines[index] = line.copy(quantity: line.quantity - 1);
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
                title: AppText(
                    context.menuName(
                        _lines[index].item.name, _lines[index].item.nameAm),
                    translate: false),
                content: TextFormField(
                    initialValue: noteText,
                    onChanged: (v) => noteText = v,
                    maxLength: 500,
                    maxLines: 3,
                    decoration: InputDecoration(
                        labelText: context.t('Notes'), counterText: '')),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(c),
                      child: const AppText('Cancel')),
                  FilledButton(
                      onPressed: () => Navigator.pop(c, noteText.trim()),
                      child: const AppText('Save'))
                ]));
    if (result != null && mounted) {
      setState(() => _lines[index] = _lines[index].copy(note: result));
      _saveSoon();
    }
  }

  Future<void> _submit() async {
    if (_busy ||
        _refreshing ||
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
      if (!canPrepare) {
        throw const ApiException('Order permission is required.');
      }
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
      if ((widget.orderId == null || widget.replacement) && !_takeaway) {
        final api = ref.read(restaurantApiProvider);
        final matches =
            (await api.tables()).where((t) => t.number == _table.text.trim());
        if (matches.isEmpty) {
          throw const ApiException(
              'Choose an active table before sending the order.');
        }
        final session = await api.tableSession(matches.first.id);
        if (session != null && code(session['status'] as String) != 'ACTIVE') {
          throw const ApiException(
              'This table has a bill awaiting payment. Ask the cashier to reopen it before adding another order.');
        }
      }
      final body = <String, dynamic>{
        'items': _lines.map((l) => l.toRequest()).toList(),
        if (widget.orderId == null || widget.replacement) ...{
          'orderType': _orderType,
          'tableNumber': _takeaway
              ? (_takeout ? 'Takeout' : 'Takeaway')
              : _table.text.trim(),
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
                    child: const AppText('Resume')),
                TextButton(
                    onPressed: () async {
                      if (await confirmAction(context, 'Discard order?',
                          'Remove these unsent items and notes?')) {
                        await _load(discard: true);
                      }
                    },
                    child: const AppText('Discard'))
              ])));
    }
    if (!_loaded) {
      return ScreenBody(
          onRefresh: _load,
          child: EmptyState(
              'Unable to load order', _error ?? 'Check the server connection.',
              action: FilledButton(
                  onPressed: _load, child: const AppText('Try again'))));
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
                        AppText(
                            widget.replacement
                                ? 'Replacement order'
                                : widget.orderId != null
                                    ? 'Add to ${shortOrderNumber(_original?.orderNumber ?? '')}'
                                    : 'Order',
                            style: Theme.of(context)
                                .textTheme
                                .titleLarge
                                ?.copyWith(fontWeight: FontWeight.w800)),
                        const SizedBox(height: 6),
                        AppText(
                            '${_lines.fold<int>(0, (count, line) => count + line.quantity)} items selected',
                            style: const TextStyle(color: muted, fontSize: 12)),
                        const SizedBox(height: 18),
                        if (widget.orderId == null || widget.replacement) ...[
                          DropdownButtonFormField<String>(
                              initialValue: _orderType,
                              decoration: InputDecoration(
                                  labelText: context.t('Order type')),
                              items: const [
                                DropdownMenuItem(
                                    value: 'DINE_IN',
                                    child: AppText('Dine in')),
                                DropdownMenuItem(
                                    value: 'TAKEAWAY',
                                    child: AppText('Takeaway')),
                                DropdownMenuItem(
                                    value: 'TAKEOUT',
                                    child: AppText('Takeout')),
                              ],
                              onChanged: _busy
                                  ? null
                                  : (value) {
                                      setState(() => _orderType = value!);
                                      _saveSoon();
                                    }),
                          const SizedBox(height: 12),
                          if (!_takeaway)
                            DropdownButtonFormField<String>(
                                initialValue:
                                    _tables.any((t) => t.number == _table.text)
                                        ? _table.text
                                        : null,
                                isExpanded: true,
                                decoration: InputDecoration(
                                    labelText: context.t('Table')),
                                items: [
                                  for (final table in _tables)
                                    DropdownMenuItem(
                                        value: table.number,
                                        child: AppText(table.label,
                                            overflow: TextOverflow.ellipsis))
                                ],
                                onChanged: _busy
                                    ? null
                                    : (value) {
                                        _table.text = value ?? '';
                                        _saveSoon();
                                      },
                                validator: localizedValidator(
                                    context,
                                    (value) => value == null
                                        ? 'Choose a table.'
                                        : null)),
                          if (!_takeaway && _tables.isEmpty)
                            const Notice(
                                'No active tables are available. Ask your manager to configure tables or choose Takeaway or Takeout.'),
                          const SizedBox(height: 12),
                          TextFormField(
                              controller: _note,
                              enabled: !_busy,
                              maxLength: 500,
                              maxLines: 2,
                              decoration: InputDecoration(
                                  labelText: context.t('Notes (optional)'),
                                  counterText: ''),
                              onChanged: (_) => _saveSoon()),
                        ],
                        if (_lines.isEmpty)
                          const Padding(
                              padding: EdgeInsets.symmetric(vertical: 20),
                              child: AppText('No items selected')),
                        for (var index = 0; index < _lines.length; index++)
                          _cartLine(index),
                      ]))),
          if (_error != null && !_uncertain) Notice(_error!, error: true),
          if (_uncertain) ...[
            const Notice('Check Orders before sending this order again.'),
            OutlinedButton(
                onPressed: () => context.go('/orders'),
                child: const AppText('View orders')),
            TextButton(
                onPressed: () async {
                  if (await confirmAction(context, 'Submit again?',
                      'Confirm this order was not already created.')) {
                    if (mounted) setState(() => _uncertain = false);
                    _saveSoon();
                  }
                },
                child: const AppText('I checked'))
          ],
        ]));
    final submitButton = FilledButton.icon(
        onPressed: _busy ||
                _refreshing ||
                _uncertain ||
                _lines.isEmpty ||
                _lines.any((l) => !l.item.available)
            ? null
            : _submit,
        icon: const Icon(Icons.send_outlined),
        label: AppText(_busy
            ? 'Sending…'
            : widget.orderId != null && !widget.replacement
                ? 'Add items'
                : 'Send order'));
    final menuItems = _menu
        .expand((c) => c.items)
        .where((i) =>
            (_categoryId == null || i.categoryId == _categoryId) &&
            '${i.name} ${i.nameAm} ${i.description} ${i.categoryName}'
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
                title: widget.replacement
                    ? 'Replacement order'
                    : widget.orderId != null
                        ? 'Add items'
                        : 'New order'),
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
                  hintText: context.t('Search dishes'),
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _searchController.text.isEmpty
                      ? null
                      : IconButton(
                          tooltip: context.t('Clear search'),
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
                        label: const AppText('All Items'),
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
                          label: AppText(
                              context.menuName(category.name, category.nameAm),
                              translate: false),
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
                child: AppText('Dishes',
                    style: TextStyle(fontWeight: FontWeight.w700))),
            AppText(
                '${menuItems.length} ${menuItems.length == 1 ? 'dish' : 'dishes'}',
                style: const TextStyle(color: muted, fontSize: 12)),
          ]),
        ]));
    final menu = CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
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
                                        AppText(item.categoryName,
                                            style: const TextStyle(
                                                color: muted, fontSize: 10)),
                                        const SizedBox(height: 4),
                                      ],
                                      AppText(
                                          context.menuName(
                                              item.name, item.nameAm),
                                          translate: false,
                                          style: const TextStyle(
                                              fontWeight: FontWeight.w700,
                                              fontSize: 15)),
                                      if (item.description.isNotEmpty) ...[
                                        const SizedBox(height: 4),
                                        AppText(item.description,
                                            translate: false,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                                color: muted, fontSize: 11)),
                                      ],
                                      const SizedBox(height: 6),
                                      AppText(
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
                                  QuantityButton(
                                      tooltip: context.t(
                                          'Decrease ${context.menuName(item.name, item.nameAm)} quantity'),
                                      onPressed:
                                          _busy ? null : () => _decrease(item),
                                      icon: Icons.remove),
                                  const SizedBox(width: 8),
                                  AppText('$quantity',
                                      style: const TextStyle(
                                          color: forestDark,
                                          fontWeight: FontWeight.w700)),
                                  const SizedBox(width: 8),
                                ],
                                QuantityButton(
                                    tooltip: context.t(
                                        'Add ${context.menuName(item.name, item.nameAm)}'),
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
                                onRefresh: _refreshMenu,
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
                                              icon:
                                                  const Icon(Icons.arrow_back),
                                              label: const AppText(
                                                  'Back to dishes'))),
                                      cart,
                                    ])))
                      else
                        Expanded(
                            child: PullToRefresh(
                                onRefresh: _refreshMenu, child: menu)),
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
                                        AppText(
                                            itemCount == 0
                                                ? 'Add dishes'
                                                : '$itemCount ${itemCount == 1 ? 'item' : 'items'}',
                                            style: const TextStyle(
                                                fontWeight: FontWeight.w800,
                                                fontSize: 18)),
                                        const SizedBox(height: 3),
                                        AppText(
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
                                      label: const AppText('Review order')),
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
                child: AppText(
                    context.menuName(line.item.name, line.item.nameAm),
                    translate: false,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 16))),
            IconButton(
                tooltip: context.t(
                    'Remove ${context.menuName(line.item.name, line.item.nameAm)}'),
                onPressed: _busy
                    ? null
                    : () {
                        setState(() => _lines.removeAt(index));
                        _saveSoon();
                      },
                icon: const Icon(Icons.delete_outline))
          ]),
          if (!line.item.available)
            const AppText('Unavailable', style: TextStyle(color: red)),
          if (line.note.isNotEmpty)
            AppText(line.note,
                translate: false, style: const TextStyle(color: muted)),
          const SizedBox(height: 8),
          Row(children: [
            QuantityButton(
                tooltip: context.t('Decrease quantity'),
                onPressed: _busy || line.quantity <= 1
                    ? null
                    : () {
                        setState(() => _lines[index] =
                            line.copy(quantity: line.quantity - 1));
                        _saveSoon();
                      },
                icon: Icons.remove),
            const SizedBox(width: 12),
            AppText('${line.quantity}',
                style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(width: 12),
            QuantityButton(
                tooltip: context.t('Increase quantity'),
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
              label: const AppText('Notes')),
          const Divider(),
        ]));
  }
}
