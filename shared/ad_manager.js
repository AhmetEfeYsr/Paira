class PairaAdManager {
    constructor() {
        this.ads = [
            {
                id: 'ad-client-waiting', // 300x250
                key: '1663d5714d42552b6ac37bcfb8f4c0bd',
                format: 'iframe',
                height: 250,
                width: 300,
                invokeUrl: 'https://www.highperformanceformat.com/1663d5714d42552b6ac37bcfb8f4c0bd/invoke.js',
                type: 'standard',
                delayOffset: 0 // 0 saniye
            },
            {
                id: 'ad-native-seo', // Native
                key: '29e233fdeff1131a7527d2f7fcf75c1e',
                invokeUrl: 'https://pl29061336.profitablecpmratenetwork.com/29e233fdeff1131a7527d2f7fcf75c1e/invoke.js',
                type: 'native',
                delayOffset: 30000 // 30 saniye faz farkı
            }
        ];

        this.refreshInterval = 150000; // 2.5 dakika (150.000 ms)
        this.intervals = {};
    }

    init() {
        // Social bar ekle
        this.injectSocialBar();

        // Diğer reklamları başlat
        this.ads.forEach(ad => {
            // İlk yüklemeyi delayOffset kadar geciktirerek başlat (veya hemen başlat)
            // Eğer delayOffset 0 ise hemen yükle, sonraki yenilemeleri 150sn de bir yap
            // Eğer delayOffset 30sn ise, ilk yüklemeyi de 30sn sonra yap (DOM'a yüklenmemek için)
            if (ad.delayOffset === 0) {
                this.loadAd(ad);
            } else {
                setTimeout(() => {
                    this.loadAd(ad);
                }, ad.delayOffset);
            }

            // Yenileme döngüsünü kur
            // Yenileme döngüsü her zaman delayOffset + ilk yükleme anından itibaren 150sn de bir çalışmalı
            setTimeout(() => {
                this.intervals[ad.id] = setInterval(() => {
                    this.loadAd(ad);
                }, this.refreshInterval);
            }, ad.delayOffset);
        });
    }

    injectSocialBar() {
        // Zaten eklenmiş mi kontrol et
        if (document.querySelector('script[src*="23fc2b275deb25a844e1bacaa2e0ce40.js"]')) return;

        const script = document.createElement('script');
        script.src = 'https://pl29061335.profitablecpmratenetwork.com/23/fc/2b/23fc2b275deb25a844e1bacaa2e0ce40.js';
        script.async = true;
        document.body.appendChild(script);
    }

    loadAd(adConfig) {
        // Container var mı bak
        const containers = document.querySelectorAll('#' + adConfig.id);

        containers.forEach(container => {
            // Eğer container gizliyse ve biz gereksiz network harcamak istemiyorsak skip edebiliriz,
            // ancak adsterra'nın scriptinin kendi içinde bir mantığı var, o yüzden doğrudan basacağız.

            // Container'ı temizle
            container.innerHTML = '';

            if (adConfig.type === 'standard') {
                // Standart iframe formatı document.write kullandığı için ana sayfayı ezmemesi adına
                // scriptleri bir iframe'in içine yerleştirmeliyiz.
                const iframe = document.createElement('iframe');
                iframe.width = adConfig.width;
                iframe.height = adConfig.height;
                iframe.style.border = 'none';
                iframe.style.overflow = 'hidden';
                iframe.scrolling = 'no';
                container.appendChild(iframe);

                const iframeDoc = iframe.contentWindow || iframe.contentDocument.document || iframe.contentDocument;
                const doc = iframeDoc.document || iframeDoc;

                doc.open();
                doc.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; height: 100%; background: transparent; }</style>
                    </head>
                    <body>
                        <script type="text/javascript">
                            atOptions = {
                                'key' : '${adConfig.key}',
                                'format' : '${adConfig.format}',
                                'height' : ${adConfig.height},
                                'width' : ${adConfig.width},
                                'params' : {}
                            };
                        </script>
                        <script type="text/javascript" src="${adConfig.invokeUrl}"></script>
                    </body>
                    </html>
                `);
                doc.close();

            } else if (adConfig.type === 'native') {
                // Native format için
                const invokeScript = document.createElement('script');
                invokeScript.type = 'text/javascript';
                invokeScript.async = true;
                invokeScript.dataset.cfasync = 'false';
                invokeScript.src = adConfig.invokeUrl;
                container.appendChild(invokeScript);

                const div = document.createElement('div');
                div.id = `container-${adConfig.key}`;
                container.appendChild(div);
            }
        });
    }
}

// Global scope'a ekle
if (typeof window !== 'undefined') {
    window.PairaAdManager = PairaAdManager;
}
