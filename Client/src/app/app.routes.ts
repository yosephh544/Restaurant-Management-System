import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards';
import { Role, Station } from './core/models';
import { Shell } from './layout/shell';
import { Home } from './pages/home';
import { LoginPage } from './pages/auth/login';
import { ForgotPasswordPage } from './pages/auth/forgot-password';
import { ResetPasswordPage } from './pages/auth/reset-password';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Sign in · Majete Corner',
    component: LoginPage,
  },
  {
    path: 'forgot-password',
    title: 'Forgot password · Majete Corner',
    component: ForgotPasswordPage,
  },
  {
    path: 'reset-password',
    title: 'Reset password · Majete Corner',
    component: ResetPasswordPage,
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
        path: 'profile',
        title: 'My profile · Majete Corner',
        loadComponent: () => import('./pages/profile/profile').then((m) => m.ProfilePage),
      },
      {
        path: 'waiter',
        canActivate: [roleGuard],
        data: { roles: [Role.Waiter] },
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
          {
            path: 'reports',
            title: 'My performance · Majete Corner',
            loadComponent: () => import('./pages/waiter/reports').then((m) => m.WaiterReportsPage),
          },
          { path: '', pathMatch: 'full', redirectTo: 'new' },
        ],
      },
      {
        path: 'kitchen',
        canActivate: [roleGuard],
        data: { roles: [Role.Kitchen], station: Station.Kitchen },
        children: [
          {
            path: '',
            title: 'Kitchen board · Majete Corner',
            loadComponent: () => import('./pages/kitchen/board').then((m) => m.KitchenBoardPage),
          },
          {
            path: 'reports',
            title: 'Kitchen performance · Majete Corner',
            data: { station: Station.Kitchen },
            loadComponent: () => import('./pages/kitchen/reports').then((m) => m.StationReportsPage),
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
        data: { roles: [Role.Bartender], station: Station.Bar },
        children: [
          {
            path: '',
            title: 'Bar board · Majete Corner',
            loadComponent: () => import('./pages/kitchen/board').then((m) => m.KitchenBoardPage),
          },
          {
            path: 'reports',
            title: 'Bar performance · Majete Corner',
            data: { station: Station.Bar },
            loadComponent: () => import('./pages/kitchen/reports').then((m) => m.StationReportsPage),
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
        data: { roles: [Role.Cashier, Role.Manager, Role.Owner, Role.SuperAdmin] },
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
          {
            path: 'reports',
            title: 'Reports · Majete Corner',
            loadComponent: () => import('./pages/manager/reports').then((m) => m.ReportsPage),
          },
          { path: '', pathMatch: 'full', redirectTo: 'bills' },
        ],
      },
      {
        path: 'manager',
        canActivate: [roleGuard],
        data: { roles: [Role.Manager, Role.Owner, Role.SuperAdmin] },
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
            path: 'password-resets',
            title: 'Password resets · Majete Corner',
            loadComponent: () => import('./pages/manager/password-resets').then((m) => m.PasswordResetsPage),
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
        data: { roles: [Role.Owner, Role.SuperAdmin] },
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
