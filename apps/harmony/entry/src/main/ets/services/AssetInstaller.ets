import { common } from '@kit.AbilityKit';
import { MessageEvents, worker } from '@kit.ArkTS';
import { fileIo } from '@kit.CoreFileKit';
import { PreparedAssets, loadPreparedAssets } from '../config/AssetConfig';

interface InstallMessage {
  type: string;
  assetName?: string;
  fraction?: number;
  message?: string;
}

export class AssetInstaller {
  prepared: PreparedAssets | undefined;
  private cancelPending: (() => void) | undefined;

  async prepare(context: common.UIAbilityContext): Promise<PreparedAssets> {
    this.prepared = await loadPreparedAssets(context);
    return this.prepared;
  }

  cancel(): void { this.cancelPending?.(); }

  async isInstalled(context: common.UIAbilityContext): Promise<boolean> {
    const prepared = this.prepared;
    if (!prepared) return false;
    const marker = `${context.filesDir}/cstf/.installed/${prepared.assetTag}/complete`;
    try {
      return fileIo.readTextSync(marker) === prepared.manifestSha256 &&
        fileIo.accessSync(`${context.filesDir}/cstf/assets/${prepared.assetTag}/data/index.json`);
    } catch (_error) { return false; }
  }

  install(context: common.UIAbilityContext, onProgress: (assetName: string, fraction: number) => void): Promise<void> {
    const prepared = this.prepared;
    if (!prepared) return Promise.reject(new Error('缺少匹配的资源安装计划'));
    if (this.cancelPending) return Promise.reject(new Error('资源安装正在进行'));
    return new Promise<void>((resolve, reject) => {
      const task = new worker.ThreadWorker('entry/ets/workers/assetWorker.ts', { name: 'CSTF asset installer' });
      let settled = false;
      const finish = (error?: Error): void => {
        if (settled) return;
        settled = true;this.cancelPending = undefined;
        try { task.terminate(); } catch (_error) { /* Already exited. */ }
        if (error) reject(error);else resolve();
      };
      this.cancelPending = (): void => finish(new Error('安装已取消，可重试恢复'));
      task.onmessage = (event: MessageEvents): void => {
        if (settled) return;
        const message = event.data as InstallMessage;
        if (message.type === 'progress') {
          try { onProgress(message.assetName ?? '', message.fraction ?? 0); }
          catch (_error) { finish(new Error('资源进度回调失败')); }
        }
        else if (message.type === 'complete') finish();
        else if (message.type === 'error') finish(new Error(message.message ?? '资源安装失败'));
      };
      task.onerror = (event): void => finish(new Error(event.message));
      task.onexit = (): void => finish(new Error('安装线程提前退出，请重试'));
      try {
        task.postMessage({ context, assetBaseUrl: prepared.assetBaseUrl, assetTag: prepared.assetTag,
          manifestSha256: prepared.manifestSha256, allowInsecureHttp: prepared.allowInsecureHttp });
      } catch (_error) { finish(new Error('无法启动资源安装线程')); }
    });
  }
}
