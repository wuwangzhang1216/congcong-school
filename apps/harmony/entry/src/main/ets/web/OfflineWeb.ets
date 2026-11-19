import { abilityAccessCtrl, common } from '@kit.AbilityKit';
import { fileIo } from '@kit.CoreFileKit';
import { resourceManager } from '@kit.LocalizationKit';
import { webview } from '@kit.ArkWeb';
import { buffer } from '@kit.ArkTS';
import { WebNetErrorList } from '@ohos.web.netErrorList';
import { AudioPermissionGate } from '../security/AudioPermissionGate';
import { WEB_ORIGIN } from '../config/AssetConfig';

const CHUNK_BYTES: number = 256 * 1024;
const RESOURCE_HOST: string = 'cstf.invalid';

@Component
export struct OfflineWeb {
  origin: string = '';
  assetTag: string = '';

  private controller: webview.WebviewController = new webview.WebviewController();
  private schemeHandler: webview.WebSchemeHandler = new webview.WebSchemeHandler();
  private attached: boolean = false;
  private audioPermission: AudioPermissionGate = new AudioPermissionGate();

  aboutToDisappear(): void {
    this.audioPermission.cancel();
  }

  private attachHandler(): void {
    if (this.attached) return;
    const context = getContext(this) as common.UIAbilityContext;
    this.schemeHandler.onRequestStart((request: webview.WebSchemeHandlerRequest, handler: webview.WebResourceHandler) => {
      const requestUrl = request.getRequestUrl();
      if (!requestUrl.startsWith(`https://${RESOURCE_HOST}/`) && requestUrl !== `https://${RESOURCE_HOST}`) {
        this.respondError(handler, 404, 'Offline resource not found');
        return true;
      }
      void this.respond(context, request, handler).catch(() => {});
      return true;
    });
    this.controller.setWebSchemeHandler('https', this.schemeHandler);
    this.attached = true;
  }

  private async respond(
    context: common.UIAbilityContext,
    request: webview.WebSchemeHandlerRequest,
    handler: webview.WebResourceHandler,
  ): Promise<void> {
    let head = false;
    let responseStarted = false;
    let filePath = '';
    let rawFilePath = '';
    let descriptor: fileIo.File | undefined;
    let rawDescriptor: resourceManager.RawFileDescriptor | undefined;
    try {
      const method = request.getRequestMethod();
      head = method === 'HEAD';
      if (method !== 'GET' && method !== 'HEAD') { this.respondError(handler, 405, 'Method Not Allowed');return; }
      const requestUrl = request.getRequestUrl();
      const origin = `https://${RESOURCE_HOST}`;
      if (!requestUrl.startsWith(`${origin}/`) && requestUrl !== origin) {
        this.respondError(handler, 404, 'Offline resource not found', -1, head);
        return;
      }
      const pathWithQuery = requestUrl.slice(origin.length);
      const pathName = pathWithQuery.split('?', 1)[0];
      const decodedPath = decodeURIComponent(pathName);
      const pathParts = decodedPath.split('/').filter((part: string) => part.length > 0);
      if (pathParts.some((part: string) => part === '..' || part === '.' || part.includes('\0') || part.includes('\\') || part.includes(':'))) {
        this.respondError(handler, 400, 'Bad Request', -1, head);
        return;
      }
      let relative = pathParts.join('/');
      if (relative.length === 0) relative = 'index.html';
      else if (decodedPath.endsWith('/')) relative += '/index.html';

      // The Web UI map still contains legacy Opus names; serve their verified MP3 siblings.
      if (relative.startsWith('audio/') && relative.endsWith('.opus')) relative = relative.slice(0, -5) + '.mp3';

      if (relative.startsWith('audio/') || relative.startsWith('data/') ||
        relative.startsWith('story-images/') || relative.startsWith('textbook-pages/')) {
        filePath = `${context.filesDir}/cstf/assets/${this.assetTag}/${relative}`;
        descriptor = fileIo.openSync(filePath, fileIo.OpenMode.READ_ONLY);
      } else {
        const fileName = relative.slice(relative.lastIndexOf('/') + 1);
        if (!fileName.includes('.')) relative += '/index.html';
        rawFilePath = `site/${relative}`;
        rawDescriptor = context.resourceManager.getRawFdSync(rawFilePath);
      }

      const fileLength = rawDescriptor?.length ?? fileIo.statSync(filePath).size;
      const fileOffset = rawDescriptor?.offset ?? 0;
      const headers = request.getHeader();
      const rangeHeader = headers.find((header) => header.headerKey.toLowerCase() === 'range')?.headerValue;
      const range = parseRange(rangeHeader, fileLength);
      if (rangeHeader && !range) {
        this.respondError(handler, 416, 'Range Not Satisfiable', fileLength, head);
        return;
      }
      const start = range?.start ?? 0;
      const end = range?.end ?? fileLength - 1;
      const responseLength = Math.max(0, end - start + 1);
      const status = range ? 206 : 200;
      const response = new webview.WebSchemeHandlerResponse();
      response.setNetErrorCode(WebNetErrorList.NET_OK);
      response.setStatus(status);
      response.setStatusText(status === 206 ? 'Partial Content' : 'OK');
      response.setMimeType(mimeType(relative));
      if (isTextResource(relative)) response.setEncoding('utf-8');
      response.setHeaderByName('Content-Length', String(responseLength), true);
      response.setHeaderByName('Accept-Ranges', 'bytes', true);
      response.setHeaderByName('Cache-Control', 'no-store', true);
      response.setHeaderByName('X-Content-Type-Options', 'nosniff', true);
      if (range) response.setHeaderByName('Content-Range', `bytes ${start}-${end}/${fileLength}`, true);
      handler.didReceiveResponse(response);
      responseStarted = true;
      if (method === 'HEAD') { handler.didFinish();return; }

      let sent = 0;
      while (sent < responseLength) {
        const size = Math.min(CHUNK_BYTES, responseLength - sent);
        const buffer = new ArrayBuffer(size);
        const sourceOffset = (rawDescriptor ? fileOffset : 0) + start + sent;
        const bytesRead = rawDescriptor
          ? fileIo.readSync(rawDescriptor.fd, buffer, { offset: sourceOffset, length: size })
          : fileIo.readSync(descriptor!.fd, buffer, { offset: sourceOffset, length: size });
        if (bytesRead <= 0) throw new Error(`Unexpected end of file: ${relative}`);
        handler.didReceiveResponseBody(buffer.slice(0, bytesRead));
        sent += bytesRead;
      }
      handler.didFinish();
    } catch (error) {
      if (!responseStarted) this.respondError(handler, 404, 'Offline resource not found', -1, head);
      else handler.didFail(WebNetErrorList.ERR_FAILED);
    } finally {
      try { if (descriptor) fileIo.closeSync(descriptor.fd); }
      finally { if (rawDescriptor) context.resourceManager.closeRawFdSync(rawFilePath); }
    }
  }

  private respondError(handler: webview.WebResourceHandler, status: number, text: string, length: number = -1, head: boolean = false): void {
    const encodedBody = buffer.from(text, 'utf-8');
    const body = encodedBody.buffer.slice(
      encodedBody.byteOffset,
      encodedBody.byteOffset + encodedBody.length,
    ) as ArrayBuffer;
    const response = new webview.WebSchemeHandlerResponse();
    response.setNetErrorCode(WebNetErrorList.NET_OK);
    response.setStatus(status);
    response.setStatusText(text);
    response.setMimeType('text/plain');
    response.setEncoding('utf-8');
    response.setHeaderByName('Content-Length', String(encodedBody.length), true);
    response.setHeaderByName('Cache-Control', 'no-store', true);
    response.setHeaderByName('X-Content-Type-Options', 'nosniff', true);
    if (status === 405) response.setHeaderByName('Allow', 'GET, HEAD', true);
    if (status === 416) response.setHeaderByName('Content-Range', `bytes */${length}`, true);
    handler.didReceiveResponse(response);
    if (!head) handler.didReceiveResponseBody(body);
    handler.didFinish();
  }

  build() {
    Web({ src: this.origin, controller: this.controller })
      .width('100%')
      .height('100%')
      .domStorageAccess(true)
      .onPermissionRequest((event) => {
        if (!event) return;
        void this.audioPermission.request(event.request, WEB_ORIGIN, async (): Promise<boolean> => {
          const context = getContext(this) as common.UIAbilityContext;
          const result = await abilityAccessCtrl.createAtManager()
            .requestPermissionsFromUser(context, ['ohos.permission.MICROPHONE']);
          return result.authResults.length > 0 && result.authResults.every((status: number) => status === 0);
        }).catch(() => {});
      })
      .onPageBegin(() => this.audioPermission.cancel())
      .onControllerAttached(() => this.attachHandler())
  }
}

interface ByteRange {
  start: number;
  end: number;
}

function parseRange(value: string | undefined, length: number): ByteRange | undefined {
  if (!value) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || length <= 0) return undefined;
  let start = match[1].length > 0 ? Number(match[1]) : Math.max(0, length - Number(match[2]));
  let end = match[2].length > 0 && match[1].length > 0 ? Number(match[2]) : length - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0) return undefined;
  if (start >= length || end < start) return undefined;
  end = Math.min(end, length - 1);
  return { start, end };
}

function mimeType(path: string): string {
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.js')) return 'application/javascript';
  if (path.endsWith('.txt')) return 'text/x-component';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.webmanifest')) return 'application/manifest+json';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.mp3')) return 'audio/mpeg';
  if (path.endsWith('.m4a')) return 'audio/mp4';
  if (path.endsWith('.opus')) return 'audio/ogg';
  if (path.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

function isTextResource(path: string): boolean {
  return path.endsWith('.txt') || path.endsWith('.html') || path.endsWith('.js') || path.endsWith('.css') ||
    path.endsWith('.json') || path.endsWith('.webmanifest') || path.endsWith('.svg');
}