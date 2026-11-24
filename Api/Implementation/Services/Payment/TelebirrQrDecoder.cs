using System.Text;

namespace RestaurantManagement.Implementation.Services.Payment;

// Port of 1RB/cheki src/lib/qr/telebirr.ts. See THIRD-PARTY-NOTICES.md (MIT).
// CRC establishes QR integrity only; payment is confirmed by the bank request.
public static class TelebirrQrDecoder
{
    public static string? Decode(string input)
    {
        if (input.Length > 4096) return null;
        var raw = string.Concat(input.Where(c => !char.IsWhiteSpace(c)));
        if (raw.Length is 0 or > 1024) return null;
        string hex;
        try
        {
            var b64 = raw.Replace('-', '+').Replace('_', '/');
            if (b64.Length % 4 == 1) return null;
            hex = Encoding.ASCII.GetString(Convert.FromBase64String(b64.PadRight((b64.Length + 3) / 4 * 4, '=')));
        }
        catch (FormatException) { hex = raw; }
        if (!IsHex(hex)) hex = raw;
        if (hex.Length is 0 or > 512 || hex.Length % 2 != 0 || !IsHex(hex)) return null;
        var entries = new List<(string Tag, string Value, int Offset)>();
        var position = 0;
        while (position < hex.Length)
        {
            if (entries.Count >= 16 || position + 4 > hex.Length) return null;
            var tag = hex.Substring(position, 2).ToUpperInvariant();
            var lengthText = hex.AsSpan(position + 2, 2);
            if (!char.IsAsciiDigit(lengthText[0]) || !char.IsAsciiDigit(lengthText[1])) return null;
            var length = (lengthText[0] - '0') * 10 + lengthText[1] - '0';
            position += 4;
            if (length == 0 || position + length > hex.Length) return null;
            entries.Add((tag, hex.Substring(position, length), position));
            position += length;
        }
        if (entries.Count < 2) return null;
        var crc = entries[^1];
        if (crc.Tag != "63" || crc.Value.Length != 4 ||
            Crc(hex[..crc.Offset]) != Convert.ToUInt16(crc.Value, 16)) return null;
        var containers = entries.Where(e => e.Tag == "81").ToArray();
        if (containers.Length != 1) return null;
        byte[] bytes;
        try { bytes = Convert.FromHexString(containers[0].Value); }
        catch (FormatException) { return null; }
        var tags = new HashSet<byte>();
        string? reference = null;
        position = 0;
        while (position < bytes.Length)
        {
            if (tags.Count >= 16 || position + 2 > bytes.Length) return null;
            var tag = bytes[position++];
            var length = bytes[position++];
            if (length >= 128 || position + length > bytes.Length || !tags.Add(tag)) return null;
            if (tag == 0)
            {
                var value = bytes.AsSpan(position, length);
                if (length != 10 || value.ContainsAnyExceptInRange((byte)'0', (byte)'Z')) return null;
                reference = Encoding.ASCII.GetString(value);
                if (reference.Any(c => !char.IsAsciiDigit(c) && c is not (>= 'A' and <= 'Z'))) return null;
            }
            position += length;
        }
        return reference;
    }

    public static ushort Crc(string text)
    {
        ushort crc = 0xffff;
        foreach (var c in text)
        {
            crc ^= (ushort)(c << 8);
            for (var bit = 0; bit < 8; bit++)
                crc = (ushort)((crc & 0x8000) != 0 ? (crc << 1) ^ 0x1021 : crc << 1);
        }
        return crc;
    }

    private static bool IsHex(string value) => value.All(char.IsAsciiHexDigit);
}
