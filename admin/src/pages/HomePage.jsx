import { useEffect } from 'react';
import { Main } from '@strapi/design-system';
import { useIntl } from 'react-intl';

import { ConfirmationModal } from '../components/ConfirmationModal';
import { AccountModal } from '../components/AccountModal';
import { FullscreenLoader } from '../components/FullscreenLoader';
import { Icon } from '../components/Icons';
import { PartialCoverageModal } from '../components/PartialCoverageModal';
import { PlanBar } from '../components/PlanBar';
import { Toast } from '../components/Toast';
import { RemediationProvider, SUBTITLES, useRemediation } from '../hooks/RemediationContext';
import { useModuleStyles } from '../hooks/useModuleStyles';
import { getTranslation } from '../utils/getTranslation';

const TAB_BUTTONS = [
  { id: 'upload', label: 'Upload', icon: 'upload' },
  { id: 'scan', label: 'Website Scan', icon: 'link' },
  { id: 'remediated', label: 'Remediated', icon: 'doc' },
];

/* Lazily-imported siblings would flash an empty panel on every tab switch, so
   all three panels stay mounted and the inactive ones are simply hidden — the
   same arrangement the standalone build used. */
import { RemediatedTab } from './tabs/RemediatedTab';
import { ScanTab } from './tabs/ScanTab';
import { UploadTab } from './tabs/UploadTab';

const Workspace = ({ theme }) => {
  const { formatMessage } = useIntl();
  const {
    tab,
    setTab,
    user,
    plans,
    isLoading,
    toastState,
    confirmState,
    partialState,
    closeConfirm,
    closePartial,
    startRemediation,
    toast,
    account,
    accountPrompt,
    accountDraft,
    connect,
    closeAccountPrompt,
    updateAccountDraft,
  } = useRemediation();

  /* Escape closes whichever modal is open, outermost first. */
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      closeConfirm();
      closePartial();
      closeAccountPrompt();
    };

    document.addEventListener('keydown', onKeyDown);

    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeConfirm, closePartial, closeAccountPrompt]);

  return (
    <div className="aiopdf-app aiopdf-embedded aiopdf-strapi" data-theme={theme}>
      {/* ---------- Page title (gradient bar) ---------- */}
      <div className="aiopdf_dashboard-page-title-wrapper">
        <div className="aiopdf_dashboard-page-title">
          <h1>
            {formatMessage({
              id: getTranslation('plugin.name'),
              defaultMessage: 'SkynetA11y PDF Remediation',
            })}
          </h1>
          <div className="subtitle">{SUBTITLES[tab]}</div>

          {/* Informational only: it names the account the panel is working
              under. There is no switch here — an account belongs to the site,
              not to whoever happens to be looking at the panel, so changing it
              is not a one-click action inside the workspace. */}
          {account ? (
            <>
              <div className="aiopdf-account-bar">
                <span>
                  <b>{account.domain}</b> · {account.email}
                </span>
              </div>
              <PlanBar user={user} />
            </>
          ) : null}
        </div>
      </div>

      {/* ---------- Tabs ---------- */}
      <div className="aiopdf_dashboard-pdf-remediation-type-list-tab">
        <ul>
          {TAB_BUTTONS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`aiopdf_btn${tab === item.id ? ' aiopdf_btn-primary active' : ''}`}
                aria-current={tab === item.id ? 'page' : undefined}
                onClick={() => setTab(item.id)}
              >
                <span className="tab-ico">
                  <Icon name={item.icon} size={25} />
                </span>{' '}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <UploadTab active={tab === 'upload'} />
      <ScanTab active={tab === 'scan'} />
      <RemediatedTab active={tab === 'remediated'} />

      {/* ---------- Modals ---------- */}
      {accountPrompt ? (
        <AccountModal
          prompt={accountPrompt.prompt}
          values={accountDraft}
          onChange={updateAccountDraft}
          onSubmit={connect}
          onClose={closeAccountPrompt}
        />
      ) : null}

      <ConfirmationModal state={confirmState} onClose={closeConfirm} />

      {partialState ? (
        <PartialCoverageModal
          state={partialState}
          user={user}
          plans={plans}
          onClose={closePartial}
          onContinue={() => startRemediation(true)}
          onToast={toast}
        />
      ) : null}

      <FullscreenLoader visible={isLoading} />
      <Toast toast={toastState} />
    </div>
  );
};

const HomePage = () => {
  const theme = useModuleStyles();

  return (
    <Main>
      <RemediationProvider>
        <Workspace theme={theme} />
      </RemediationProvider>
    </Main>
  );
};

export { HomePage };
