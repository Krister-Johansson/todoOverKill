import { useEffect, useState } from 'react'

import type { RefObject } from 'react'

/**
 * Whether the region is wider inside than out. It watches the region and its
 * content, so a resize, a zoom change, or a different number of columns
 * updates it. The content must size to its children for the last one. False on
 * the server and until the first measurement.
 */
export function useOverflowsX(
  regionRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
) {
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const region = regionRef.current
    const content = contentRef.current
    if (!region || !content) return
    const measure = () => setOverflows(region.scrollWidth > region.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(region)
    observer.observe(content)
    return () => observer.disconnect()
  }, [regionRef, contentRef])

  return overflows
}
