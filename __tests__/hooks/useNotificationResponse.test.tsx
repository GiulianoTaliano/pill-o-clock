import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Sentry from '@sentry/react-native';
import { useNotificationResponseHandler } from '../../src/hooks/useNotificationResponse';
import { getMedicationById, getSchedulesByMedication } from '../../src/db/database';
import { getNotifMapEntry } from '../../src/services/notifications';
import { SavedDoseError } from '../../src/store/slices/medications';
import { makeMedication, makeSchedule } from '../factories';

jest.mock('../../src/store', () => ({ useAppStore: { getState: () => mockState } }));
jest.mock('../../src/db/database', () => ({ getMedicationById: jest.fn(), getSchedulesByMedication: jest.fn() }));
jest.mock('../../src/services/notifications', () => ({ ACTION_TAKEN: 'taken', ACTION_SKIP: 'skip', ACTION_SNOOZE: 'snooze', getNotifMapEntry: jest.fn() }));
jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn().mockResolvedValue(null),
  clearLastNotificationResponseAsync: jest.fn().mockResolvedValue(undefined),
  dismissNotificationAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/i18n', () => ({ __esModule: true, default: { t: (key: string) => key } }));

const mockState = { medications: [] as ReturnType<typeof makeMedication>[], schedules: [] as ReturnType<typeof makeSchedule>[], snoozedTimes: {},
  markDose: jest.fn().mockResolvedValue(undefined), snoozeDose: jest.fn().mockResolvedValue(undefined), setSelectedAppointmentId: jest.fn() };
const response = (actionIdentifier: string) => ({ actionIdentifier, notification: { request: { identifier: 'notif-1', content: { data: {} } } } } as Notifications.NotificationResponse);

beforeEach(() => {
  jest.clearAllMocks();
  mockState.medications = [];
  mockState.schedules = [];
  mockState.markDose.mockResolvedValue(undefined);
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(null);
  jest.mocked(getMedicationById).mockResolvedValue(makeMedication({ regimen: JSON.stringify({ type: 'taper', steps: [{ days: 1, amount: 20 }, { days: 5, amount: 10 }] }), startDate: '2025-06-15' }));
  jest.mocked(getSchedulesByMedication).mockResolvedValue([makeSchedule()]);
  jest.mocked(getNotifMapEntry).mockResolvedValue({ medicationId: 'med-1', scheduleId: 'sch-1', scheduledDate: '2025-06-16', scheduledTime: '08:00', doseLogId: 'sch-1-2025-06-16' });
});

it('does no notification or database work before bootstrap is ready', () => {
  renderHook(() => useNotificationResponseHandler(false));
  expect(Notifications.addNotificationResponseReceivedListener).not.toHaveBeenCalled();
  expect(Notifications.getLastNotificationResponseAsync).not.toHaveBeenCalled();
  expect(getMedicationById).not.toHaveBeenCalled();
});

it('recovers a cold-start action for another person with the effective taper dose', async () => {
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(response('taken'));
  renderHook(() => useNotificationResponseHandler(true));
  await waitFor(() => expect(mockState.markDose).toHaveBeenCalled());
  expect(mockState.markDose.mock.calls[0]).toEqual([expect.objectContaining({ medication: expect.objectContaining({ dosageAmount: 10 }), scheduledDate: '2025-06-16' }), 'taken']);
  expect(getMedicationById).toHaveBeenCalledWith('med-1');
});

it('routes snooze through the store and deduplicates simultaneous recovery and live delivery', async () => {
  const notification = response('snooze');
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(notification);
  renderHook(() => useNotificationResponseHandler(true));
  const listener = jest.mocked(Notifications.addNotificationResponseReceivedListener).mock.calls[0][0];
  act(() => { listener(notification); });
  await waitFor(() => expect(mockState.snoozeDose).toHaveBeenCalledTimes(1));
});

it('handles a saved partial failure without an unhandled rejection or repeated registration', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockState.markDose.mockRejectedValueOnce(new SavedDoseError());
  jest.mocked(Notifications.getLastNotificationResponseAsync).mockResolvedValue(response('taken'));
  renderHook(() => useNotificationResponseHandler(true));
  await waitFor(() => expect(alert).toHaveBeenCalledWith('uxMedication.registered', 'uxMedication.registeredWarning'));
  expect(Sentry.captureException).toHaveBeenCalled();
  expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
  alert.mockRestore();
});
