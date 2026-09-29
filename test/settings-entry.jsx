/* Smoke-test entry for the plugin's Settings page. */
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import { DesignSystemProvider } from '@strapi/design-system';

import { SettingsPage } from '../admin/src/pages/SettingsPage';

window.__mount = () => {
  const root = createRoot(document.getElementById('root'));

  root.render(
    <DesignSystemProvider>
      <IntlProvider locale="en" messages={{}}>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </IntlProvider>
    </DesignSystemProvider>
  );

  return root;
};
