/**
 * Понятное название устройства по User-Agent: «Chrome · Windows»,
 * «Яндекс Браузер · Android». Для экрана подтверждения входа по QR-коду:
 * человек должен узнать свой компьютер.
 */
export function describeDevice(ua: string | undefined | null): { browser: string; os: string; label: string } {
  const s = ua || '';
  const browser = /YaBrowser/i.test(s)
    ? 'Яндекс Браузер'
    : /Edg(e|A|iOS)?\//.test(s)
      ? 'Edge'
      : /OPR\/|Opera/.test(s)
        ? 'Opera'
        : /Firefox\/|FxiOS/.test(s)
          ? 'Firefox'
          : /Chrome\/|CriOS/.test(s)
            ? 'Chrome'
            : /Safari\//.test(s)
              ? 'Safari'
              : 'Браузер';
  const os = /Windows/.test(s)
    ? 'Windows'
    : /Android/.test(s)
      ? 'Android'
      : /iPhone|iPad|iPod/.test(s)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(s)
          ? 'macOS'
          : /CrOS/.test(s)
            ? 'ChromeOS'
            : /Linux/.test(s)
              ? 'Linux'
              : '';
  return { browser, os, label: os ? `${browser} · ${os}` : browser };
}
