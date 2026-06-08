<?php

/**
 * Copyright (c) 2026 Eric Seigne <eric.seigne@cap-rel.fr>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 */

namespace Dolipocket\Tests\Unit;

use Dolipocket\Api\Trait\PaginatedListTrait;
use PHPUnit\Framework\TestCase;

/**
 * Characterization tests for PaginatedListTrait::normalizeTimestamp().
 *
 * Locks down the current behavior across the full range of inputs the
 * AutoForm front-end and Dolibarr backend can send:
 *
 *   - empty-ish inputs (null, '', false, [], objects) -> null
 *   - numeric in seconds (10 digits) -> returned as-is (int)
 *   - numeric in milliseconds (12+ digits, threshold > 99999999999) -> /1000
 *   - ISO-ish strings ("YYYY-MM-DD", "YYYY-MM-DDTHH:MM:SS[Z]") -> strtotime
 *   - non-date strings -> null
 *   - negative numerics -> kept as-is (epoch before 1970)
 *
 * Timezone is forced to UTC in setUp() so strtotime() results are deterministic.
 *
 * Branches covered (cf normalizeTimestamp() implementation):
 *   1. null / '' / false short-circuit
 *   2. is_numeric branch with > 99999999999 threshold (intdiv /1000)
 *   3. is_numeric branch under threshold (cast to int)
 *   4. is_string branch with strtotime() success
 *   5. is_string branch with strtotime() failure -> null
 *   6. Final fallback (true, array, object, other types) -> null
 */
class PaginatedListNormalizeTimestampTest extends TestCase
{
    /** @var string|false */
    private $previousTz;

    protected function setUp(): void
    {
        // Force UTC so strtotime() returns deterministic timestamps regardless
        // of the host system timezone (CI runners can be on America/* or Europe/*).
        $this->previousTz = date_default_timezone_get();
        date_default_timezone_set('UTC');
    }

    protected function tearDown(): void
    {
        if (is_string($this->previousTz) && $this->previousTz !== '') {
            date_default_timezone_set($this->previousTz);
        }
    }

    /**
     * Expose the protected static normalizeTimestamp() through a tiny host
     * that uses the trait. Reflection would also work but a subclass keeps
     * the call-site readable in failure messages.
     *
     * @param mixed $value
     * @return int|null
     */
    private function normalize($value)
    {
        return PaginatedListNormalizeTimestampHost::expose($value);
    }

    // ---------------------------------------------------------------------
    // Branch 1: empty-ish inputs short-circuit to null
    // ---------------------------------------------------------------------

    public function testNullReturnsNull(): void
    {
        $this->assertNull($this->normalize(null));
    }

    public function testEmptyStringReturnsNull(): void
    {
        $this->assertNull($this->normalize(''));
    }

    public function testBooleanFalseReturnsNull(): void
    {
        $this->assertNull($this->normalize(false));
    }

    // ---------------------------------------------------------------------
    // Branch 6: other "empty-ish" / non-numeric / non-string types
    // (true, array, object) - not in the short-circuit list, fall through
    // is_numeric (false) and is_string (false), end up at final null.
    // ---------------------------------------------------------------------

    public function testBooleanTrueReturnsNull(): void
    {
        // true is not numeric and not a string -> falls through to final null.
        $this->assertNull($this->normalize(true));
    }

    public function testEmptyArrayReturnsNull(): void
    {
        $this->assertNull($this->normalize([]));
    }

    public function testNonEmptyArrayReturnsNull(): void
    {
        $this->assertNull($this->normalize([1, 2, 3]));
    }

    public function testObjectReturnsNull(): void
    {
        $this->assertNull($this->normalize(new \stdClass()));
    }

    // ---------------------------------------------------------------------
    // Branch 3: numeric input under the 11-nines threshold (in seconds)
    // ---------------------------------------------------------------------

    public function testZeroIntReturnsZero(): void
    {
        // 0 is numeric (not in the short-circuit list since 0 !== '' !== false
        // strict equality). Returned as-is via cast to int.
        $this->assertSame(0, $this->normalize(0));
    }

    public function testStringZeroReturnsZero(): void
    {
        // '0' is numeric. The short-circuit only excludes '' (empty), so '0'
        // falls into the numeric branch.
        $this->assertSame(0, $this->normalize('0'));
    }

    public function testTenDigitSecondsReturnedAsIs(): void
    {
        // 1717000000 = Tue May 28 2024 16:26:40 UTC (10 digits, fits in seconds).
        $this->assertSame(1717000000, $this->normalize(1717000000));
    }

    public function testStringTenDigitSecondsReturnedAsIs(): void
    {
        $this->assertSame(1717000000, $this->normalize('1717000000'));
    }

    public function testElevenDigitNinesStaysAsSeconds(): void
    {
        // 99999999999 (11 nines) is the boundary: > 99999999999 is FALSE for
        // this exact value, so it stays as seconds.
        $this->assertSame(99999999999, $this->normalize(99999999999));
    }

    public function testStringElevenDigitNinesStaysAsSeconds(): void
    {
        $this->assertSame(99999999999, $this->normalize('99999999999'));
    }

    public function testNegativeIntKeptAsIs(): void
    {
        // Pre-1970 timestamps are valid numerics here, the trait does not clamp.
        $this->assertSame(-1, $this->normalize(-1));
    }

    public function testNegativeStringNumericKeptAsIs(): void
    {
        // '-100' is_numeric -> branch 3, returns -100 (NOT strtotime'd).
        $this->assertSame(-100, $this->normalize('-100'));
    }

    public function testFloatTruncatedToInt(): void
    {
        // is_numeric accepts floats. Cast to int truncates toward zero.
        $this->assertSame(1717000000, $this->normalize(1717000000.5));
    }

    public function testStringFloatTruncatedToInt(): void
    {
        $this->assertSame(1717000000, $this->normalize('1717000000.5'));
    }

    // ---------------------------------------------------------------------
    // Branch 2: numeric input above the threshold (in milliseconds)
    // ---------------------------------------------------------------------

    public function testTwelveDigitMsConvertedToSeconds(): void
    {
        // 100000000000 (12 digits, smallest value triggering the ms branch).
        // > 99999999999 evaluates to TRUE, intdiv(100000000000, 1000) = 100000000.
        $this->assertSame(100000000, $this->normalize(100000000000));
    }

    public function testThirteenDigitMsConvertedToSeconds(): void
    {
        // 1717000000000 ms = 1717000000 s = Tue May 28 2024 16:26:40 UTC.
        // This is what smartcommon Input type="date" sends (Date.getTime()).
        $this->assertSame(1717000000, $this->normalize(1717000000000));
    }

    public function testStringThirteenDigitMsConvertedToSeconds(): void
    {
        $this->assertSame(1717000000, $this->normalize('1717000000000'));
    }

    public function testScientificNotationStringHandledAsNumeric(): void
    {
        // '1.5e12' parses as 1.5 * 10^12 = 1500000000000 (13 digits ms) -> /1000.
        $this->assertSame(1500000000, $this->normalize('1.5e12'));
    }

    public function testStringNumericWithWhitespacePreserved(): void
    {
        // is_numeric() accepts leading whitespace (PHP quirk). (int) cast
        // also trims. So '  42  ' is numeric and returns 42.
        $this->assertSame(42, $this->normalize('  42  '));
    }

    // ---------------------------------------------------------------------
    // Branch 4: ISO date strings -> strtotime() success
    // ---------------------------------------------------------------------

    public function testIsoDateOnly(): void
    {
        // strtotime('2026-06-15') under UTC = 2026-06-15 00:00:00 UTC.
        $expected = gmmktime(0, 0, 0, 6, 15, 2026);
        $this->assertSame($expected, $this->normalize('2026-06-15'));
    }

    public function testIsoDateTimeNoTimezone(): void
    {
        // strtotime() with no TZ in the string uses default_timezone (UTC here).
        $expected = gmmktime(10, 30, 0, 6, 15, 2026);
        $this->assertSame($expected, $this->normalize('2026-06-15T10:30:00'));
    }

    public function testIsoDateTimeWithZ(): void
    {
        // 'Z' is explicit UTC.
        $expected = gmmktime(10, 30, 0, 6, 15, 2026);
        $this->assertSame($expected, $this->normalize('2026-06-15T10:30:00Z'));
    }

    public function testIsoDateTimeWithPositiveOffset(): void
    {
        // 2026-06-15 10:30:00 +02:00 = 2026-06-15 08:30:00 UTC.
        $expected = gmmktime(8, 30, 0, 6, 15, 2026);
        $this->assertSame($expected, $this->normalize('2026-06-15T10:30:00+02:00'));
    }

    public function testIsoDateTimeWithNegativeOffset(): void
    {
        // 2026-06-15 10:30:00 -05:00 = 2026-06-15 15:30:00 UTC.
        $expected = gmmktime(15, 30, 0, 6, 15, 2026);
        $this->assertSame($expected, $this->normalize('2026-06-15T10:30:00-05:00'));
    }

    public function testHumanReadableDateString(): void
    {
        // strtotime() is generous: "2026-06-15 10:30:00" (space, not T) works.
        $expected = gmmktime(10, 30, 0, 6, 15, 2026);
        $this->assertSame($expected, $this->normalize('2026-06-15 10:30:00'));
    }

    // ---------------------------------------------------------------------
    // Branch 5: invalid string inputs -> strtotime() returns false -> null
    // ---------------------------------------------------------------------

    public function testNonDateStringReturnsNull(): void
    {
        $this->assertNull($this->normalize('not a date'));
    }

    public function testGarbageStringReturnsNull(): void
    {
        $this->assertNull($this->normalize('foobar123xyz'));
    }

    public function testMalformedIsoStringReturnsNull(): void
    {
        // strtotime() rejects malformed dates (month 99 etc.).
        $this->assertNull($this->normalize('2026-99-99'));
    }

    // ---------------------------------------------------------------------
    // Data provider sweep covering the canonical cases listed in the spec
    // ---------------------------------------------------------------------

    /**
     * @dataProvider provideCanonicalCases
     *
     * @param mixed    $input
     * @param int|null $expected
     */
    public function testCanonicalCases($input, $expected, string $description): void
    {
        $actual = $this->normalize($input);
        $this->assertSame(
            $expected,
            $actual,
            "Failed for case: ".$description
        );
    }

    /**
     * @return array<string, array{0: mixed, 1: int|null, 2: string}>
     */
    public function provideCanonicalCases(): array
    {
        // Pre-compute timezone-stable expectations.
        $tz = date_default_timezone_get();
        date_default_timezone_set('UTC');
        $isoDateOnly = gmmktime(0, 0, 0, 6, 15, 2026);
        $isoDateTime = gmmktime(10, 30, 0, 6, 15, 2026);
        date_default_timezone_set($tz);

        return [
            'null input'                  => [null, null, 'null'],
            'empty string'                => ['', null, "''"],
            'boolean false'               => [false, null, 'false'],
            'boolean true'                => [true, null, 'true (final fallback)'],
            'empty array'                 => [[], null, '[]'],
            'object stdClass'             => [new \stdClass(), null, 'stdClass()'],
            'zero int'                    => [0, 0, '0'],
            'zero string'                 => ['0', 0, "'0'"],
            'seconds 10 digits int'       => [1717000000, 1717000000, '1717000000 (seconds)'],
            'seconds 10 digits string'    => ['1717000000', 1717000000, "'1717000000'"],
            'milliseconds 13 digits int'  => [1717000000000, 1717000000, '1717000000000 (ms)'],
            'milliseconds 13 digits str'  => ['1717000000000', 1717000000, "'1717000000000'"],
            'ms threshold lower bound'    => [100000000000, 100000000, '100000000000 (12 digits, ms branch)'],
            'ms threshold upper sec'      => [99999999999, 99999999999, '99999999999 (11 nines, stays seconds)'],
            'iso date only'               => ['2026-06-15', $isoDateOnly, "'2026-06-15'"],
            'iso datetime'                => ['2026-06-15T10:30:00', $isoDateTime, "'2026-06-15T10:30:00'"],
            'invalid string'              => ['not a date', null, "'not a date'"],
            'negative int'                => [-1, -1, '-1'],
            'negative numeric string'     => ['-100', -100, "'-100'"],
        ];
    }
}

/**
 * Tiny host class that uses the trait and exposes its protected static
 * helper. Kept in the same file (same namespace) to keep the test
 * self-contained.
 *
 * @internal Test-only helper.
 */
class PaginatedListNormalizeTimestampHost
{
    use PaginatedListTrait;

    /**
     * @param mixed $value
     * @return int|null
     */
    public static function expose($value)
    {
        return self::normalizeTimestamp($value);
    }
}
