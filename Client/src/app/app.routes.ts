import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards';
import { Shell } from './layout/shell';
import { Home } from './pages/home';
import { LoginPage } from './pages/auth/login';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in · Majete Corner',
    component: LoginPage,
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Majete Corner',
        component: Home,
      },
      {
        path: 'waiter',
        canActivate: [roleGuard],
        data: { roles: ['WAITER'] },
        children: [
          {
            path: 'new',
            title: 'New order · Majete Corner',
            loadComponent: () => import('./pages/waiter/new-order').then((m) => m.NewOrderPage),
          },
          {
            path: 'orders',
            title: 'My orders · Majete Corner',
            loadComponent: () => import('./pages/waiter/orders').then((m) => m.WaiterOrdersPage),
          },
          {
            path: 'orders/:id',
            title: 'Order · Majete Corner',
            loadComponent: () => import('./pages/waiter/order-detail').then((m) => m.OrderDetailPage),
          },
          {
            path: 'issues',
            title: 'Kitchen & bar issues · Majete Corner',
            loadComponent: () => import('./pages/waiter/issues').then((m) => m.WaiterIssuesPage),
          },
          { path: '', pathMatch: 'full', redirectTo: 'new' },
        ],
      },
      {
        path: 'kitchen',
        canActivate: [roleGuard],
        data: { roles: ['KITCHEN'], station: 'KITCHEN' },
        children: [
          {
            path: '',
            title: 'Kitchen board · Majete Corner',
            loadComponent: () => import('./pages/kitchen/board').then((m) => m.KitchenBoardPage),
          },
          {
            path: ':id',
            title: 'Ticket · Majete Corner',
            loadComponent: () => import('./pages/kitchen/ticket').then((m) => m.KitchenTicketPage),
          },
        ],
      },
      {
        path: 'bar',
        canActivate: [roleGuard],
        data: { roles: ['BARTENDER'], station: 'BAR' },
        children: [
          {
            path: '',
            title: 'Bar board · Majete Corner',
            loadComponent: () => import('./pages/kitchen/board').then((m) => m.KitchenBoardPage),
          },
          {
            path: ':id',
            title: 'Bar ticket · Majete Corner',
            loadComponent: () => import('./pages/kitchen/ticket').then((m) => m.KitchenTicketPage),
          },
        ],
      },
      {
        path: 'cashier',
        canActivate: [roleGuard],
        data: { roles: ['CASHIER', 'MANAGER', 'OWNER'] },
        children: [
          {
            path: 'bills',
            title: 'Open bills · Majete Corner',
            loadComponent: () => import('./pages/cashier/bills').then((m) => m.CashierBillsPage),
          },
          {
            path: 'bills/:id',
            title: 'Bill · Majete Corner',
            loadComponent: () => import('./pages/cashier/bill-detail').then((m) => m.BillDetailPage),
          },
          {
            path: 'bills/:id/receipt',
            title: 'Receipt · Majete Corner',
            loadComponent: () => import('./pages/cashier/receipt').then((m) => m.ReceiptPage),
          },
          {
            path: 'payments',
            title: 'Payments · Majete Corner',
            loadComponent: () => import('./pages/cashier/payments').then((m) => m.CashierPaymentsPage),
          },
          { path: '', pathMatch: 'full', redirectTo: 'bills' },
        ],
      },
      {
        path: 'manager',
        canActivate: [roleGuard],
        data: { roles: ['MANAGER', 'OWNER'] },
        children: [
          {
            path: '',
            title: 'Dashboard · Majete Corner',
            loadComponent: () => import('./pages/manager/dashboard').then((m) => m.ManagerDashboardPage),
          },
          {
            path: 'reports',
            title: 'Reports · Majete Corner',
            loadComponent: () => import('./pages/manager/reports').then((m) => m.ReportsPage),
          },
          {
            path: 'staff',
            title: 'Staff · Majete Corner',
            loadComponent: () => import('./pages/manager/staff').then((m) => m.StaffPage),
          },
          {
            path: 'shifts',
            title: 'Shifts · Majete Corner',
            loadComponent: () => import('./pages/manager/shifts').then((m) => m.ShiftsPage),
          },
          {
            path: 'issues',
            title: 'Kitchen & bar issues · Majete Corner',
            loadComponent: () => import('./pages/manager/issues').then((m) => m.ManagerIssuesPage),
          },
          {
            path: 'audit',
            title: 'Audit log · Majete Corner',
            loadComponent: () => import('./pages/manager/audit').then((m) => m.AuditLogPage),
          },
          {
            path: 'menu',
            title: 'Menu · Majete Corner',
            loadComponent: () => import('./pages/manager/menu').then((m) => m.MenuPage),
          },
        ],
      },
      {
        path: 'admin',
        canActivate: [roleGuard],
        data: { roles: ['OWNER'] },
        children: [
          {
            path: 'users',
            title: 'Users & roles · Majete Corner',
            loadComponent: () => import('./pages/admin/users').then((m) => m.UsersPage),
          },
          {
            path: 'settings',
            title: 'Settings · Majete Corner',
            loadComponent: () => import('./pages/admin/settings').then((m) => m.SettingsPage),
          },
          { path: '', pathMatch: 'full', redirectTo: 'users' },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
