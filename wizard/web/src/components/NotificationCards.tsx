import type { CSSProperties } from 'react';
import { MarkdownText } from './MarkdownText';
import type { WizardNotification } from '../lib/constants';

interface Props {
  notifications?: WizardNotification[];
  target: 'stremio' | 'nuvio' | null;
}

const themedCardStyle: CSSProperties = {
  background: 'var(--panel-2)',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '0.95rem 1rem',
  marginBottom: '1rem',
  color: 'var(--text)',
  display: 'flex',
  alignItems: 'center',
};

export function NotificationCards({ notifications = [], target }: Props) {
  const visibleNotifications = notifications.filter((notification) => {
    if (!notification.targets?.length) return true;
    return target ? notification.targets.includes(target) : false;
  });

  if (!visibleNotifications.length) return null;

  return (
    <>
      {visibleNotifications.map((notification, index) => {
        const style = notification.style;
        const cardStyle: CSSProperties = style
          ? {
              ...themedCardStyle,
              background: style.background ?? themedCardStyle.background,
              border: `1px solid ${style.borderColor ?? 'transparent'}`,
              color: style.textColor ?? themedCardStyle.color,
              boxShadow: style.boxShadow,
            }
          : themedCardStyle;

        return (
          <div
            key={`${notification.markdown}-${index}`}
            className="wizard-notification-card"
            style={cardStyle}
          >
            <MarkdownText
              text={notification.markdown}
              className="wizard-notification-card__body"
              style={{
                margin: 0,
                fontSize: '0.92rem',
                color: 'inherit',
                width: '100%',
                textAlign: style?.textAlign ?? 'center',
              }}
            />
          </div>
        );
      })}
    </>
  );
}
