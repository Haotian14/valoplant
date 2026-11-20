import { useEffect, useState } from 'react';
import type { Strategy } from './strategy.ts';

export function useMediaUrls(media: Strategy['media']) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const objects = Object.fromEntries(Object.entries(media).map(([name, bytes]) => {
      const extension = name.split('.').at(-1)?.toLowerCase();
      const type = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;
      return [name, URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }))];
    }));
    setUrls(objects);
    return () => Object.values(objects).forEach(url => URL.revokeObjectURL(url));
  }, [media]);
  return urls;
}
