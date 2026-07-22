import { useEffect, useRef, useState } from 'react';
import { toastBus } from '../lib/ui';

export function Toast() {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const unbind = toastBus.bind((m) => {
      setMsg(m);
      setShow(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setShow(false), 2600);
    });
    return () => {
      unbind();
      clearTimeout(timer.current);
    };
  }, []);

  return (
    <div className={`toast${show ? ' show' : ''}`} role="status">
      {msg}
    </div>
  );
}
