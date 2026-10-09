/* EvoSupplement Windows launcher shortcut; project MIT license.
 * Binary format: Microsoft MS-SHLLINK, sections 2.1, 2.4, 2.5.5.
 * https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-shllink/16cb4ca1-9339-4d0c-a68d-bf1d6cc0f943
 *
 * RelativePath is relative to the .lnk file, never to the author's computer.
 * Icon paths do not have those relative semantics, so use a Windows system
 * resource through an IconEnvironmentDataBlock. No install, registry entry,
 * absolute publication path, or modification on recipient launch is needed.
 */
(function (scope) {
  'use strict';

  const HEADER_SIZE = 0x4c;
  const ICON_ENVIRONMENT_SIZE = 0x314;
  const TARGET = '.\\Open-supplement.cmd';
  const DESCRIPTION = 'Open the EvoSupplement publication in your browser';
  const ICON_PATH = '%SystemRoot%\\System32\\shell32.dll';
  const ICON_INDEX = 14;
  const CLSID = [0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
    0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46];

  function writeUnicode(view, offset, value) {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint16(offset + index * 2, value.charCodeAt(index), true);
    }
  }

  function writeStringData(view, offset, value) {
    // MS-SHLLINK StringData counts UTF-16 code units, without a terminating NUL.
    view.setUint16(offset, value.length, true);
    writeUnicode(view, offset + 2, value);
    return offset + 2 + value.length * 2;
  }

  function createWindowsShortcut() {
    const strings = [DESCRIPTION, TARGET, ICON_PATH];
    const stringsSize = strings.reduce((total, value) => total + 2 + value.length * 2, 0);
    const bytes = new Uint8Array(HEADER_SIZE + stringsSize + ICON_ENVIRONMENT_SIZE + 4);
    const view = new DataView(bytes.buffer);

    view.setUint32(0x00, HEADER_SIZE, true);
    bytes.set(CLSID, 0x04);
    // HasName | HasRelativePath | HasIconLocation | IsUnicode | HasExpIcon.
    // No LinkInfo, PIDL, working directory, arguments, or link tracking data.
    view.setUint32(0x14, 0x000040cc, true);
    view.setUint32(0x18, 0x00000080, true); // FILE_ATTRIBUTE_NORMAL.
    view.setInt32(0x38, ICON_INDEX, true);
    view.setUint32(0x3c, 1, true); // SW_SHOWNORMAL: keep the server console visible.

    let offset = HEADER_SIZE;
    for (const value of strings) offset = writeStringData(view, offset, value);

    // MS-SHLLINK 2.5.5: fixed-size, NUL-terminated ANSI and UTF-16 fields.
    view.setUint32(offset, ICON_ENVIRONMENT_SIZE, true);
    view.setUint32(offset + 4, 0xa0000007, true);
    for (let index = 0; index < ICON_PATH.length; index += 1) {
      bytes[offset + 8 + index] = ICON_PATH.charCodeAt(index);
    }
    writeUnicode(view, offset + 268, ICON_PATH);
    // The zero-initialized final DWORD is the required ExtraData TerminalBlock.
    return bytes;
  }

  const api = Object.freeze({ createWindowsShortcut });
  scope.EvoSupplementPortableShortcut = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
