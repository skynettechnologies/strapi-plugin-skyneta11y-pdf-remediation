/* Smoke-test entry: mounts the plugin's HomePage against a mocked service. */
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { DesignSystemProvider } from '@strapi/design-system';

import { HomePage } from '../admin/src/pages/HomePage';

window.__mount = () => {
  const container = document.getElementById('root');
  const root = createRoot(container);

  root.render(
    <DesignSystemProvider>
      <IntlProvider locale="en" messages={{}}>
        <HomePage />
      </IntlProvider>
    </DesignSystemProvider>
  );

  return root;
};
