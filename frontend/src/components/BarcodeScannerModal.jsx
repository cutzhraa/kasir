import { useCallback, useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const createScanConfig = (cameraId) => ({
  fps: 10,
  qrbox: (viewfinderWidth, viewfinderHeight) => ({
    width: Math.max(1, Math.floor(viewfinderWidth * 0.96)),
    height: Math.max(1, Math.floor(viewfinderHeight * 0.9))
  }),
  disableFlip: false,
  videoConstraints: {
    ...(cameraId
      ? { deviceId: { exact: cameraId } }
      : { facingMode: { ideal: 'environment' } }),
    width: { ideal: 1280 },
    height: { ideal: 720 }
  }
});

export default function BarcodeScannerModal({ isOpen, onClose, onScanSuccess }) {
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const [activeCameraLabel, setActiveCameraLabel] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [scanStatus, setScanStatus] = useState('');
  const [liveScanResult, setLiveScanResult] = useState('');
  const [photoScanResult, setPhotoScanResult] = useState(null);
  const [isPhotoDecoding, setIsPhotoDecoding] = useState(false);
  const [isStarting, setIsStarting] = useState(true);
  const [manualCode, setManualCode] = useState('');
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  const scannerRef = useRef(null);
  const isStoppingRef = useRef(false);
  const stopPromiseRef = useRef(Promise.resolve());
  const scannerStartPromiseRef = useRef(Promise.resolve());
  const onScanSuccessRef = useRef(onScanSuccess);
  const fallbackCleanupRef = useRef(null);

  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  const stopScanner = useCallback((scanner, startPromise) => {
    const stopTask = stopPromiseRef.current
      .catch((err) => {
        console.error('Proses stop scanner sebelumnya gagal:', err);
      })
      .then(async () => {
        await startPromise.catch(() => {});
        if (scanner.isScanning) {
          await scanner.stop();
        }
      });

    stopPromiseRef.current = stopTask;
    return stopTask;
  }, []);

  const enableContinuousFocus = async (scanner) => {
    try {
      const capabilities = scanner.getRunningTrackCapabilities();
      if (capabilities.focusMode?.includes('continuous')) {
        await scanner.applyVideoConstraints({
          advanced: [{ focusMode: 'continuous' }]
        });
      }
    } catch (err) {
      console.warn('Autofocus kontinu tidak didukung kamera:', err);
    }
  };

  const handleDecodedText = useCallback(async (decodedText) => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;
    fallbackCleanupRef.current?.();
    fallbackCleanupRef.current = null;

    const scanner = scannerRef.current;
    if (scanner) {
      try {
        await stopScanner(scanner, scannerStartPromiseRef.current);
      } catch (err) {
        console.error('Gagal menghentikan scanner setelah barcode terbaca:', err);
        setCameraError('Barcode terbaca, tetapi kamera gagal dihentikan: ' + err.message);
      }
    }

    const code = decodedText.trim();
    setLiveScanResult(code);
    setScanStatus(`Kamera berhasil membaca: ${code}`);
  }, [stopScanner]);

  const handlePhotoUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoScanResult({ fileName: file.name, code: '', message: 'File harus berupa gambar.' });
      return;
    }

    setIsPhotoDecoding(true);
    setPhotoScanResult({ fileName: file.name, code: '', message: 'Sedang membaca foto...' });
    const imageUrl = URL.createObjectURL(file);

    try {
      const {
        BrowserMultiFormatReader,
        BarcodeFormat,
        BinaryBitmap,
        DecodeHintType,
        HybridBinarizer,
        MultiFormatOneDReader,
        RGBLuminanceSource
      } = await import('@zxing/library');
      const image = new Image();
      image.src = imageUrl;
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight) {
        throw new Error('Foto berhasil dibuka, tetapi ukuran gambarnya kosong.');
      }

      const canvas = document.createElement('canvas');

      const nativeFormats = [
        'ean_13',
        'ean_8',
        'upc_a',
        'upc_e',
        'code_128',
        'code_39',
        'code_93',
        'codabar',
        'itf'
      ];
      if ('BarcodeDetector' in window) {
        try {
          const detector = new window.BarcodeDetector({ formats: nativeFormats });
          const detections = await detector.detect(image);
          const detectedCode = detections.find((result) => result.rawValue)?.rawValue;
          if (detectedCode) {
            setPhotoScanResult({
              fileName: file.name,
              code: detectedCode,
              message: 'Barcode berhasil dibaca dari foto (BarcodeDetector).'
            });
            return;
          }
        } catch (err) {
          console.info('BarcodeDetector tidak dapat membaca foto; mencoba decoder alternatif:', err);
        }
      }

      const hints = new Map([
        [
          DecodeHintType.POSSIBLE_FORMATS,
          [
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.CODE_93,
            BarcodeFormat.CODABAR,
            BarcodeFormat.ITF
          ]
        ],
        [DecodeHintType.TRY_HARDER, true]
      ]);

      let code = '';
      const browserReader = new BrowserMultiFormatReader(hints);
      try {
        code = (await browserReader.decodeFromImageElement(image)).getText();
      } catch {
        // Continue with image crops and preprocessing when a full-image decode misses.
      } finally {
        browserReader.reset();
      }

      const attempts = [
        { x: 0, y: 0, width: 1, height: 1, scale: 1, contrast: 1 },
        { x: 0.08, y: 0.1, width: 0.84, height: 0.8, scale: 1.5, contrast: 1 },
        { x: 0.05, y: 0.2, width: 0.9, height: 0.6, scale: 2, contrast: 1 },
        { x: 0.05, y: 0.2, width: 0.9, height: 0.6, scale: 2, contrast: 1.5 }
      ];

      for (const attempt of code ? [] : attempts) {
        const sourceX = Math.floor(image.naturalWidth * attempt.x);
        const sourceY = Math.floor(image.naturalHeight * attempt.y);
        const sourceWidth = Math.max(1, Math.floor(image.naturalWidth * attempt.width));
        const sourceHeight = Math.max(1, Math.floor(image.naturalHeight * attempt.height));
        canvas.width = Math.max(1, Math.min(2400, Math.floor(sourceWidth * attempt.scale)));
        canvas.height = Math.max(1, Math.min(1600, Math.floor(sourceHeight * attempt.scale)));
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context || !canvas.width || !canvas.height) {
          throw new Error('Tidak dapat menyiapkan gambar foto untuk dibaca.');
        }
        context.filter = attempt.contrast > 1
          ? `grayscale(1) contrast(${attempt.contrast})`
          : 'grayscale(1)';
        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );
        context.filter = 'none';
        let rgba;
        try {
          rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
        } catch (err) {
          throw new Error(`Gagal membaca piksel foto (${canvas.width}x${canvas.height}): ${err.message}`);
        }
        const luminance = new Uint8ClampedArray(canvas.width * canvas.height);
        for (let pixel = 0; pixel < luminance.length; pixel += 1) {
          const offset = pixel * 4;
          luminance[pixel] =
            (306 * rgba[offset] + 601 * rgba[offset + 1] + 117 * rgba[offset + 2]) >> 10;
        }
        const source = new RGBLuminanceSource(luminance, canvas.width, canvas.height);
        for (const luminanceSource of [source, source.invert()]) {
          const reader = new MultiFormatOneDReader(hints);
          try {
            const bitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));
            code = reader.decode(bitmap, hints).getText();
            if (code) break;
          } catch {
            // Continue with the next image preprocessing attempt.
          } finally {
            reader.reset();
          }
        }
        if (code) break;
      }

      setPhotoScanResult({
        fileName: file.name,
        code,
        message: code
          ? 'Barcode berhasil dibaca dari foto.'
          : 'Barcode terlihat, tetapi decoder belum bisa membaca pola garis pada foto ini. Masukkan nomor di bawah barcode secara manual untuk melanjutkan.'
      });
    } catch (err) {
      console.error('Gagal memproses foto barcode:', err);
      setPhotoScanResult({
        fileName: file.name,
        code: '',
        message: err.message || 'Gagal memproses foto.'
      });
    } finally {
      URL.revokeObjectURL(imageUrl);
      setIsPhotoDecoding(false);
    }
  };

  const selectScanResult = (code) => {
    if (code) onScanSuccessRef.current(code);
  };

  const startHighSensitivityFallback = useCallback(async (scanner) => {
    let active = true;
    let timer;
    let hintTimer;
    fallbackCleanupRef.current = () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(hintTimer);
    };
    setScanStatus('Memuat decoder sensitivitas tinggi…');

    let decoder;
    try {
      decoder = await import('@zxing/library');
    } catch (err) {
      console.error('Gagal memuat decoder barcode tambahan:', err);
      setScanStatus('Decoder sensitivitas tinggi gagal dimuat: ' + err.message);
      return;
    }
    if (!active || !scanner.isScanning) return;
    const {
      BarcodeFormat,
      BinaryBitmap,
      DecodeHintType,
      HybridBinarizer,
      MultiFormatOneDReader,
      RGBLuminanceSource
    } = decoder;

    const video = document.querySelector('#barcode-scanner-viewfinder video');
    if (!(video instanceof HTMLVideoElement)) {
      setScanStatus('Kamera aktif, tetapi elemen video tidak tersedia untuk decoder tambahan.');
      return;
    }

    const hints = new Map([
      [
        DecodeHintType.POSSIBLE_FORMATS,
        [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.CODABAR,
          BarcodeFormat.ITF
        ]
      ],
      [DecodeHintType.TRY_HARDER, true]
    ]);
    const reader = new MultiFormatOneDReader(hints);

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      setScanStatus('Decoder tambahan tidak dapat menyiapkan gambar kamera.');
      return;
    }

    hintTimer = setTimeout(() => {
      if (active) {
        setScanStatus('Pemindaian masih berjalan. Arahkan kamera ke barcode sampai terbaca; pastikan garisnya tajam dan tidak silau.');
      }
    }, 5000);
    const decodeFrame = () => {
      if (!active || isStoppingRef.current || !scanner.isScanning) return;

      try {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const luminance = new Uint8ClampedArray(canvas.width * canvas.height);
          for (let pixel = 0; pixel < luminance.length; pixel += 1) {
            const offset = pixel * 4;
            luminance[pixel] =
              (306 * rgba[offset] + 601 * rgba[offset + 1] + 117 * rgba[offset + 2]) >> 10;
          }
          const bitmap = new BinaryBitmap(
            new HybridBinarizer(new RGBLuminanceSource(luminance, canvas.width, canvas.height))
          );
          const result = reader.decode(bitmap, hints);
          if (result?.getText()) {
            void handleDecodedText(result.getText());
            return;
          }
        }
      } catch {
        // A missed frame is expected while continuously scanning.
      }

      timer = setTimeout(decodeFrame, 250);
    };

    setScanStatus('Kamera aktif; mencoba decoder sensitivitas tinggi untuk barcode EAN/UPC.');
    timer = setTimeout(decodeFrame, 300);
  }, [handleDecodedText]);

  useEffect(() => {
    if (!isOpen) return;

    let html5QrCode = null;
    let startPromise = Promise.resolve();
    let cancelled = false;
    isStoppingRef.current = false;
    setIsStarting(true);
    setCameraError('');
    setScanStatus('');
    setLiveScanResult('');
    setPhotoScanResult(null);
    setHasTorch(false);
    setIsTorchOn(false);

    async function initScanner() {
      try {
        await stopPromiseRef.current;
        if (cancelled) return;

        const devices = await Html5Qrcode.getCameras();
        if (cancelled) return;
        if (!devices || devices.length === 0) {
          setCameraError('Tidak ditemukan kamera pada perangkat ini.');
          setIsStarting(false);
          return;
        }

        setCameras(devices);

        // Prioritaskan kamera belakang (environment) untuk scanning barcode produk
        const backCamera = devices.find(
          (d) =>
            /back|belakang|rear|environment|triple|wide|ultra/i.test(d.label)
        );

        // If labels do not identify the rear camera, ask the browser for environment-facing video.
        const targetCamera = backCamera || devices[0];
        const targetCamId = backCamera?.id || '';
        setSelectedCameraId(targetCamera.id);
        setActiveCameraLabel(backCamera?.label || 'Meminta kamera belakang (environment)');

        // Format barcode produk yang umum digunakan.
        const formatsToSupport = [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE
        ];

        html5QrCode = new Html5Qrcode('barcode-scanner-viewfinder', {
          formatsToSupport,
          verbose: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true
          }
        });
        scannerRef.current = html5QrCode;

        const scanConfig = createScanConfig(targetCamId);

        startPromise = html5QrCode.start(
          targetCamId || { facingMode: 'environment' },
          scanConfig,
          handleDecodedText,
          () => {}
        );
        scannerStartPromiseRef.current = startPromise;
        await startPromise;

        if (cancelled) {
          await stopScanner(html5QrCode, startPromise);
          return;
        }

        await enableContinuousFocus(html5QrCode);
        void startHighSensitivityFallback(html5QrCode);
        try {
          const activeDeviceId = html5QrCode.getRunningTrackSettings().deviceId;
          const actualCamera = devices.find((device) => device.id === activeDeviceId);
          if (actualCamera) {
            setSelectedCameraId(actualCamera.id);
            setActiveCameraLabel(actualCamera.label || `Kamera ${actualCamera.id}`);
          }
        } catch (err) {
          console.warn('Tidak dapat membaca nama kamera aktif:', err);
        }

        // Cek kemampuan lampu flash/torch kamera
        try {
          const capabilities = html5QrCode.getRunningTrackCapabilities();
          if (capabilities && capabilities.torch) {
            setHasTorch(true);
          }
        } catch {}

        setIsStarting(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Gagal mengakses kamera:', err);
        const secureContextHint = window.isSecureContext
          ? ''
          : ' Kamera hanya tersedia melalui HTTPS atau localhost.';
        const errorName = err && typeof err === 'object' ? err.name : '';
        const errorDetail = err?.message || (typeof err === 'string' ? err : '');
        const message = errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError'
          ? 'Izin kamera ditolak. Izinkan akses kamera untuk situs ini di pengaturan browser, lalu buka scanner kembali.'
          : errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError'
            ? 'Kamera tidak ditemukan. Sambungkan kamera atau gunakan input barcode manual.'
            : errorDetail || 'Periksa izin kamera dan koneksi kamera pada browser Anda.';
        setCameraError(
          'Tidak dapat mengakses kamera: ' + message + secureContextHint
        );
        setIsStarting(false);
      }
    }

    const timer = setTimeout(() => {
      initScanner();
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      fallbackCleanupRef.current?.();
      fallbackCleanupRef.current = null;
      isStoppingRef.current = true;
      if (scannerRef.current === html5QrCode) {
        scannerRef.current = null;
      }
      if (html5QrCode) {
        stopPromiseRef.current = stopScanner(html5QrCode, startPromise).then(() => {
          html5QrCode.clear();
        }).catch((err) => {
          console.error('Gagal membersihkan scanner kamera:', err);
        });
      }
    };
  }, [handleDecodedText, isOpen, startHighSensitivityFallback, stopScanner]);

  // Handler Ganti Kamera
  const handleSwitchCamera = async (e) => {
    const newId = e.target.value;
    setSelectedCameraId(newId);
    if (!scannerRef.current) return;

    try {
      const scanner = scannerRef.current;
      isStoppingRef.current = true;
      fallbackCleanupRef.current?.();
      fallbackCleanupRef.current = null;
      setIsStarting(true);
      setIsTorchOn(false);
      await stopScanner(scanner, scannerStartPromiseRef.current);

      const startPromise = scanner.start(
        newId,
        createScanConfig(newId),
        handleDecodedText,
        () => {}
      );
      scannerStartPromiseRef.current = startPromise;
      await startPromise;
      await enableContinuousFocus(scanner);
      void startHighSensitivityFallback(scanner);
      isStoppingRef.current = false;
      setActiveCameraLabel(cameras.find((camera) => camera.id === newId)?.label || `Kamera ${newId}`);

      try {
        const capabilities = scanner.getRunningTrackCapabilities();
        setHasTorch(!!(capabilities && capabilities.torch));
      } catch {}

      setIsStarting(false);
    } catch (err) {
      isStoppingRef.current = false;
      setCameraError('Gagal beralih kamera: ' + (err?.message || err));
      setIsStarting(false);
    }
  };

  // Toggle Lampu Flash / Torch untuk pencahayaan rendah
  const handleToggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextTorch = !isTorchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch }]
      });
      setIsTorchOn(nextTorch);
    } catch (err) {
      console.warn('Gagal mengubah lampu flash:', err);
    }
  };

  // Handler input manual / barcode gun
  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;

    isStoppingRef.current = true;
    fallbackCleanupRef.current?.();
    fallbackCleanupRef.current = null;
    const scanner = scannerRef.current;
    if (scanner) {
      try {
        await stopScanner(scanner, scannerStartPromiseRef.current);
      } catch (err) {
        console.error('Gagal menghentikan kamera sebelum input manual:', err);
        setCameraError('Gagal menghentikan kamera: ' + (err?.message || err));
        isStoppingRef.current = false;
        return;
      }
    }
    onScanSuccess(manualCode.trim());
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-card animate-fade" style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            <span>⚡ Scan Barcode</span>
          </h3>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {/* Info & Format Dukungan */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
            Kamera aktif: {activeCameraLabel || 'memilih kamera belakang'}. Barcode harus tajam dan tidak silau.
          </p>

          {/* Tombol Flashlight jika didukung */}
          {hasTorch && (
            <button
              type="button"
              className={isTorchOn ? 'btn-success' : 'btn-outline'}
              style={{ fontSize: '11px', padding: '4px 10px' }}
              onClick={handleToggleTorch}
            >
              {isTorchOn ? '💡 Flash Menyala' : '🔦 Nyalakan Flash'}
            </button>
          )}
        </div>

        {/* Viewfinder Kamera */}
        <div className="scanner-container">
          <div
            id="barcode-scanner-viewfinder"
            style={{ width: '100%', borderRadius: '10px', overflow: 'hidden' }}
          ></div>
          <div className="scanner-laser-line"></div>
          {isStarting && (
            <div className="scanner-overlay-msg">
              <span>Menyiapkan kamera ultra-sensitif...</span>
            </div>
          )}
        </div>

        {/* Pesan Error Kamera */}
        {cameraError && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              padding: '10px 14px',
              borderRadius: '8px',
              color: '#b91c1c',
              fontSize: '13px'
            }}
          >
            {cameraError}
          </div>
        )}
        {scanStatus && !cameraError && (
          <p role="status" style={{ color: '#475569', fontSize: '12px', margin: 0 }}>
            {scanStatus}
          </p>
        )}

        <section
          aria-label="Perbandingan hasil scan"
          style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', display: 'grid', gap: '8px' }}
        >
          <strong style={{ fontSize: '13px' }}>Perbandingan hasil</strong>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            <span>Scan kamera</span>
            <span>{liveScanResult || 'Belum terbaca'}</span>
            {liveScanResult && (
              <button type="button" className="btn-primary" onClick={() => selectScanResult(liveScanResult)}>
                Gunakan
              </button>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
            <span>Input foto</span>
            <span>
              {photoScanResult?.code || photoScanResult?.message || 'Belum diuji'}
              {photoScanResult?.fileName && (
                <small style={{ display: 'block', color: '#64748b' }}>{photoScanResult.fileName}</small>
              )}
            </span>
            {photoScanResult?.code && (
              <button type="button" className="btn-primary" onClick={() => selectScanResult(photoScanResult.code)}>
                Gunakan
              </button>
            )}
          </div>
          {liveScanResult && photoScanResult?.code && (
            <strong role="status" style={{ fontSize: '12px', color: liveScanResult === photoScanResult.code ? '#15803d' : '#b91c1c' }}>
              {liveScanResult === photoScanResult.code
                ? 'Hasil kamera dan foto cocok.'
                : 'Hasil kamera dan foto berbeda; periksa barcode sebelum digunakan.'}
            </strong>
          )}
        </section>

        <div className="form-group">
          <label className="form-label" htmlFor="barcode-photo-input">Uji dengan foto barcode:</label>
          <input
            id="barcode-photo-input"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoUpload}
            disabled={isPhotoDecoding}
          />
          {isPhotoDecoding && <span role="status">Menganalisis foto barcode…</span>}
        </div>

        {/* Dropdown Ganti Kamera jika ada lebih dari 1 */}
        {cameras.length > 1 && (
          <div className="form-group" style={{ marginTop: '2px' }}>
            <label className="form-label" style={{ fontSize: '11px' }}>
              Pilih Lensa Kamera:
            </label>
            <select
              value={selectedCameraId}
              onChange={handleSwitchCamera}
              disabled={isStarting}
              style={{ fontSize: '13px', height: '36px' }}
            >
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || `Kamera ${c.id}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Alternatif: Input Manual atau Barcode Gun USB */}
        <form
          onSubmit={handleManualSubmit}
          style={{
            borderTop: '1px dashed var(--border)',
            paddingTop: '10px',
            marginTop: '4px'
          }}
        >
          <label className="form-label" style={{ fontSize: '12px', color: '#64748b' }}>
            Atau input kode barcode manual / USB scanner:
          </label>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <input
              type="text"
              placeholder="Contoh: 899100100001"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              style={{ flex: 1, height: '38px', fontSize: '13px' }}
            />
            <button type="submit" className="btn-primary" style={{ height: '38px' }}>
              Cek Barcode
            </button>
          </div>
        </form>

        <div className="modal-actions" style={{ marginTop: '4px' }}>
          <button type="button" className="btn-outline" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
