import { afterEach, expect, it, vi } from 'vitest'
import { activityIndicator } from './activity-indicator'
afterEach(() => vi.useRealTimers())
it('no parpadea con operaciones breves repetidas', () => {
  vi.useFakeTimers()
  const show = vi.fn(), activity = activityIndicator(show)
  for (let i = 0; i < 20; i++) {
    activity.update(true); vi.advanceTimersByTime(80)
    activity.update(false); vi.advanceTimersByTime(80)
  }
  expect(show).not.toHaveBeenCalled()
  activity.dispose()
})
it('muestra trabajos largos y conserva el aviso entre operaciones cercanas', () => {
  vi.useFakeTimers()
  const show = vi.fn(), activity = activityIndicator(show)
  activity.update(true); vi.advanceTimersByTime(350)
  expect(show).toHaveBeenLastCalledWith(true)
  activity.update(false); vi.advanceTimersByTime(200); activity.update(true)
  vi.advanceTimersByTime(700); expect(show).toHaveBeenCalledTimes(1)
  activity.update(false); vi.advanceTimersByTime(650)
  expect(show).toHaveBeenLastCalledWith(false)
  activity.dispose()
})
