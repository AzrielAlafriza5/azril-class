import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

export const PageTransition: React.FC<{
  children: React.ReactNode;
  pageKey: string;
}> = ({ children, pageKey }) => {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <div>{children}</div>;
  }

  return (
    <motion.div
      key={pageKey}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
};
