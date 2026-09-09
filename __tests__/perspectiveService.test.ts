/**
 * Unit tests for Perspective helpers (no native modules).
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/tmp',
  exists: jest.fn(async () => false),
  mkdir: jest.fn(async () => undefined),
  unlink: jest.fn(async () => undefined),
  copyFile: jest.fn(async () => undefined),
}));

import {
  countDistinctModels,
  isPerspectivePreset,
  mergeDebateOverrides,
  seatDisplayName,
  DEFAULT_DEBATE_N_PREDICT,
  type PerspectivePreset,
  type PerspectiveSeat,
} from '../src/services/perspectiveService';
import {
  applyDebateOverridesToSettings,
  buildNativeMessagesForSeat,
  buildSeatAssistantPlaceholder,
  resolveSeatModelFileName,
  seatsHaveAssignedModels,
} from '../src/services/perspectiveOrchestrator';
import { DEFAULT_SETTINGS } from '../src/services/modelSettingsService';

describe('perspectiveService', () => {
  const seats: PerspectiveSeat[] = [
    { id: 'a', label: 'Skeptic', modelFileName: 'a.gguf' },
    { id: 'b', inlinePersona: { name: 'Advocate' }, modelFileName: 'a.gguf' },
    { id: 'c', label: 'Third', modelFileName: 'b.gguf' },
  ];

  it('seatDisplayName prefers label then inline persona', () => {
    expect(seatDisplayName(seats[0])).toBe('Skeptic');
    expect(seatDisplayName(seats[1])).toBe('Advocate');
    expect(seatDisplayName({ id: 'x', modelFileName: 'tiny.gguf' })).toBe('tiny');
  });

  it('countDistinctModels ignores shared files', () => {
    expect(countDistinctModels(seats.slice(0, 2))).toBe(1);
    expect(countDistinctModels(seats)).toBe(2);
  });

  it('mergeDebateOverrides caps n_predict by default', () => {
    const m = mergeDebateOverrides({
      temperature: 0.7,
      n_ctx: 2048,
      n_predict: 1024,
    });
    expect(m.n_predict).toBe(DEFAULT_DEBATE_N_PREDICT);
    expect(m.temperature).toBe(0.7);
  });

  it('isPerspectivePreset requires min seats', () => {
    const bad: PerspectivePreset = {
      id: 'p',
      name: 'One',
      seats: [{ id: 'only' }],
      createdAt: 1,
      updatedAt: 1,
    };
    expect(isPerspectivePreset(bad)).toBe(false);
    expect(
      isPerspectivePreset({
        ...bad,
        seats: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
      }),
    ).toBe(true);
  });
});

describe('perspectiveOrchestrator', () => {
  it('resolveSeatModelFileName requires an assigned model', () => {
    expect(resolveSeatModelFileName({ id: 's' })).toBeNull();
    expect(
      resolveSeatModelFileName({
        id: 's',
        modelFileName: 'other.gguf',
      }),
    ).toBe('other.gguf');
  });

  it('seatsHaveAssignedModels', () => {
    expect(
      seatsHaveAssignedModels([
        { id: 'a', modelFileName: 'a.gguf' },
        { id: 'b', modelFileName: 'b.gguf' },
      ]),
    ).toBe(true);
    expect(
      seatsHaveAssignedModels([{ id: 'a', modelFileName: 'a.gguf' }, { id: 'b' }]),
    ).toBe(false);
  });

  it('applyDebateOverridesToSettings does not mutate base object identity fields beyond overrides', () => {
    const next = applyDebateOverridesToSettings(DEFAULT_SETTINGS, {
      temperature: 0.9,
      n_predict: 200,
    });
    expect(next.temperature).toBe(0.9);
    expect(next.n_predict).toBe(200);
    expect(DEFAULT_SETTINGS.temperature).not.toBe(0.9);
  });

  it('buildSeatAssistantPlaceholder stamps seat fields', () => {
    const msg = buildSeatAssistantPlaceholder(
      {
        id: 'seat1',
        label: 'Skeptic',
        inlinePersona: { name: 'Skeptic', avatar: 'search' },
      },
      [],
      'model.gguf',
    );
    expect(msg.perspectiveSeatId).toBe('seat1');
    expect(msg.perspectiveSeatLabel).toBe('Skeptic');
    expect(msg.personaName).toBe('Skeptic');
    expect(msg.perspectiveModelFileName).toBe('model.gguf');
  });

  it('buildNativeMessagesForSeat replaces system and drops empty trailing assistant', () => {
    const out = buildNativeMessagesForSeat(
      [
        { role: 'system', content: 'old' },
        { role: 'user', content: 'topic' },
        { role: 'assistant', content: '' },
      ],
      'debate-sys',
    );
    expect(out).toHaveLength(2);
    expect(out[0].content).toBe('debate-sys');
    expect(out[1].role).toBe('user');
  });

  it('buildNativeMessagesForSeat appends a turn cue after a prior speaker', () => {
    const out = buildNativeMessagesForSeat(
      [
        { role: 'system', content: 'old' },
        { role: 'user', content: 'Meaning of life is to suffer' },
        {
          role: 'assistant',
          content: 'That is a bold claim that does not hold up under scrutiny.',
        },
        { role: 'assistant', content: '' },
      ],
      'advocate-sys',
      { seatLabel: 'Advocate' },
    );
    expect(out[0].content).toBe('advocate-sys');
    expect(out.map((m) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ]);
    expect(out[out.length - 1].content).toContain('Your turn as Advocate');
  });
});
