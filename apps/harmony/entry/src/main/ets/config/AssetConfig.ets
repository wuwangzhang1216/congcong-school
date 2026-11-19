import { common } from '@kit.AbilityKit';
import { buffer } from '@kit.ArkTS';

export const WEB_ORIGIN: string = 'https://cstf.invalid';

export interface PreparedAssets {
  assetTag: string;
  manifestSha256: string;
  assetBaseUrl: string;
  allowInsecureHttp: boolean;
  downloadBytes: number;
  requiredStorageBytes: number;
  shellSha256: string;
}

export async function loadPreparedAssets(context: common.UIAbilityContext): Promise<PreparedAssets> {
  const bytes = await context.resourceManager.getRawFileContent('site/harmony-build.json');
  if (bytes.byteLength > 16384) throw new Error('HAP 安装配置过大');
  const prepared = JSON.parse(buffer.from(bytes).toString('utf-8')) as PreparedAssets;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(prepared.assetTag) || !/^[a-f0-9]{64}$/.test(prepared.manifestSha256) ||
    !/^[a-f0-9]{64}$/.test(prepared.shellSha256) || typeof prepared.assetBaseUrl !== 'string' ||
    typeof prepared.allowInsecureHttp !== 'boolean' || !Number.isSafeInteger(prepared.downloadBytes) || prepared.downloadBytes <= 0 ||
    !Number.isSafeInteger(prepared.requiredStorageBytes) || prepared.requiredStorageBytes < prepared.downloadBytes) {
    throw new Error('请先生成与资源版本匹配的 Harmony 页面包');
  }
  return prepared;
}
