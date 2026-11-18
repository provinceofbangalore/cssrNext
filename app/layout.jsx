import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './globals.css';

export const metadata = {
  title: 'CSSR.IN | Redemptorists Bangalore Province',
  description: 'A community of faith. A mission of hope. Discover the missions, communities and people of the Redemptorists Bangalore Province.',
  applicationName: 'CSSR.IN'
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#063b55'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
