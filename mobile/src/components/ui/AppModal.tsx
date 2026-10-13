import React from 'react';
import { Modal, ModalProps } from 'react-native';
import ToastHost from './ToastHost';

/**
 * Окно приложения: обычный Modal, внутри которого тоже показываются
 * всплывающие уведомления (иначе они оказались бы под окном).
 */
export default function AppModal({ children, ...props }: ModalProps & { children?: React.ReactNode }) {
  return (
    <Modal {...props}>
      {children}
      <ToastHost connection={false} />
    </Modal>
  );
}
