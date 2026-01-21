import { describe, expect, it } from 'vitest';
import {
    extractDiscordId,
    extractDiscordIds,
    isValidHttpUrl,
    chunkContent,
    createTextComponentMessage,
} from '../../../services/discord.js';

describe('services/discord', () => {
    describe('extractDiscordId', () => {
        it('returns null when the input is empty', () => {
            expect(extractDiscordId()).toBeNull();
            expect(extractDiscordId('')).toBeNull();
        });

        it('returns the first 17-20 digit sequence', () => {
            const mention = '<@123456789012345678>';
            expect(extractDiscordId(mention)).toBe('123456789012345678');
        });

        it('ignores shorter numbers', () => {
            const text = 'id: 42 and 9876543210987654321 in here';
            expect(extractDiscordId(text)).toBe('9876543210987654321');
        });
    });

    describe('extractDiscordIds', () => {
        it('returns an empty array when no ids are present', () => {
            expect(extractDiscordIds()).toEqual([]);
            expect(extractDiscordIds('just text')).toEqual([]);
        });

        it('collects unique ids in order of appearance', () => {
            const text = '<@123456789012345678> and <@!123456789012345678> plus 999999999999999999';
            expect(extractDiscordIds(text)).toEqual(['123456789012345678', '999999999999999999']);
        });
    });

    describe('isValidHttpUrl', () => {
        it('accepts http and https urls', () => {
            expect(isValidHttpUrl('http://example.com')).toBe(true);
            expect(isValidHttpUrl('https://example.com/path')).toBe(true);
        });

        it('rejects other protocols and invalid input', () => {
            expect(isValidHttpUrl('ftp://example.com')).toBe(false);
            expect(isValidHttpUrl('notaurl')).toBe(false);
            expect(isValidHttpUrl('')).toBe(false);
        });
    });

    describe('chunkContent', () => {
        it('chunks long strings with wrapping', () => {
            const chunks = chunkContent('1234567890', { maxLength: 6, wrap: { prefix: '[', suffix: ']' } });
            expect(chunks).toEqual(['[1234]', '[5678]', '[90]']);
        });

        it('chunks arrays and preserves empty lines', () => {
            const chunks = chunkContent(['a', '', 'b'], { maxLength: 3 });
            expect(chunks.length).toBeGreaterThan(0);
            expect(chunks.join('\n')).toContain('a');
        });

        it('throws when wrap consumes the whole limit', () => {
            expect(() => chunkContent('x', { maxLength: 2, wrap: { prefix: '[[', suffix: ']]' } }))
                .toThrow('Chunk wrap leaves no room for content');
        });
    });

    describe('createTextComponentMessage', () => {
        it('builds a message with components and flags', () => {
            const msg = createTextComponentMessage('hello');
            expect(msg.content).toBeUndefined();
            expect(msg.components.length).toBeGreaterThan(0);
            expect(typeof msg.flags).toBe('number');
        });

        it('coerces null content to a space', () => {
            const msg = createTextComponentMessage(null);
            const json = msg.components[0]?.toJSON ? msg.components[0].toJSON() : msg.components[0];
            expect(json.content).toBe(' ');
        });
    });
});
