import ProductShell from '@/components/ProductShell';

export const metadata = { title: 'Dashboard · Creatora AI' };

export default function DashboardLayout({ children }) {
  return <ProductShell>{children}</ProductShell>;
}
