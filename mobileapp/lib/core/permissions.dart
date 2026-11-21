/// Permission names returned by GET /auth/me.
abstract final class P {
  static const menuView = 'menu.view';
  static const availability = 'menu.availability.manage';
  static const ordersView = 'orders.view';
  static const ordersCreate = 'orders.create';
  static const ordersAdd = 'orders.items.add';
  static const ordersReorder = 'orders.reorder';
  static const ordersServe = 'orders.serve';
  static const kitchenView = 'kitchen.view';
  static const kitchenUpdate = 'kitchen.update';
  static const kitchenCancel = 'kitchen.cancel';
  static const paymentsInitiate = 'payments.initiate';
  static const paymentsView = 'payments.view';
  static const paymentsRetract = 'payments.retract';
  static const tipsView = 'tips.view';

  // The service app keeps floor work with Waiter, even when the API grants
  // another role broader permissions.
  static const waiterActions = {
    ordersCreate,
    ordersAdd,
    ordersReorder,
    ordersServe,
  };
}
