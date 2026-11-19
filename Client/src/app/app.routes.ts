import { Routes } from '@angular/router';
import { authGuard, guestGuard, roleGuard } from './core/guards';
import { Shell } from './layout/shell';
import { Home } from './pages/home';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    title: 'Sign in · RestoPro',
    loadComponent: () => import('./pages/auth/login').then((m) => m.LoginPage),
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    title: 'Forgot password · RestoPro',
    loadComponent: () => import('./pages/auth/forgot-password').then((m) => m.ForgotPasswordPage),
  },
  {
    path: 'reset-password',
    canActivate: [guestGuard],
    title: 'Reset password · RestoPro',
    loadComponent: () => import('./pages/auth/reset-password').then((m) => m.ResetPasswordPage),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'RestoPro',
        component: Home,
      },
      {
        path: 'waiter',
        canActivate: [roleGuard],
        data: { roles: ['WAITER'] },
        children: [
          {
            path: 'new',
            title: 'New order · RestoPro',
            loadComponent: () => import('./pages/waiter/new-order').then((m) => m.NewOrderPage),
          },
          {
            path: 'orders',
            title: 'My orders · RestoPro',
            loadComponent: () => import('./pages/waiter/orders').then((m) => m.WaiterOrdersPage),
          },
          {
            path: 'orders/:id',
            title: 'Order · RestoPro',
            loadComponent: () => import('./pages/waiter/order-detail').then((m) => m.OrderDetailPage),
          },
          {
            path: 'issues',
            title: 'Kitchen issues · RestoPro',
            loadComponent: () => import('./pages/waiter/issues').then((m) => m.WaiterIssuesPage),
          },
          { path: '', pathMatch: 'full', redirectTo: 'new' },
        ],
      },
      {
        path: 'kitchen',
        canActivate: [roleGuard],
        data: { roles: ['KITCHEN'] },
        children: [
          {
            path: '',
            title: 'Kitchen board · RestoPro',
            loadComponent: () => import('./pages/kitchen/board').then((m) => m.KitchenBoardPage),
          },
          {
            path: ':id',
            title: 'Ticket · RestoPro',
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
            title: 'Open bills · RestoPro',
            loadComponent: () => import('./pages/cashier/bills').then((m) => m.CashierBillsPage),
          },
          {
            path: 'bills/:id',
            title: 'Bill · RestoPro',
            loadComponent: () => import('./pages/cashier/bill-detail').then((m) => m.BillDetailPage),
          },
          {
            path: 'bills/:id/receipt',
            title: 'Receipt · RestoPro',
            loadComponent: () => import('./pages/cashier/receipt').then((m) => m.ReceiptPage),
          },
          {
            path: 'payments',
            title: 'Payments · RestoPro',
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
            title: 'Dashboard · RestoPro',
            loadComponent: () => import('./pages/manager/dashboard').then((m) => m.ManagerDashboardPage),
          },
          {
            path: 'reports',
            title: 'Reports · RestoPro',
            loadComponent: () => import('./pages/manager/reports').then((m) => m.ReportsPage),
          },
          {
            path: 'staff',
            title: 'Staff · RestoPro',
            loadComponent: () => import('./pages/manager/staff').then((m) => m.StaffPage),
          },
          {
            path: 'issues',
            title: 'Kitchen issues · RestoPro',
            loadComponent: () => import('./pages/manager/issues').then((m) => m.ManagerIssuesPage),
          },
          {
            path: 'audit',
            title: 'Audit log · RestoPro',
            loadComponent: () => import('./pages/manager/audit').then((m) => m.AuditLogPage),
          },
          {
            path: 'menu',
            title: 'Menu · RestoPro',
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
            title: 'Users & roles · RestoPro',
            loadComponent: () => import('./pages/admin/users').then((m) => m.UsersPage),
          },
          {
            path: 'settings',
            title: 'Settings · RestoPro',
            loadComponent: () => import('./pages/admin/settings').then((m) => m.SettingsPage),
          },
          { path: '', pathMatch: 'full', redirectTo: 'users' },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
