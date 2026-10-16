import { useEffect, useState } from 'react';

const QUERY = '(max-width: 760px)';

/** True on phone-sized screens. Updates when the window is resized or the phone is rotated. */
export default function useIsMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return mobile;
}
