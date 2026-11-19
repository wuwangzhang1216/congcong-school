import { AbilityConstant, UIAbility, Want } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { deviceInfo } from '@kit.BasicServicesKit';
import { cancelPendingAudioRequests } from '../security/AudioPermissionGate';
import { hilog } from '@kit.PerformanceAnalysisKit';

export default class EntryAbility extends UIAbility {
  onCreate(_want: Want, _launchParam: AbilityConstant.LaunchParam): void {
    hilog.info(0x0000, 'CSTF', 'Harmony ability created');
  }

  onBackground(): void { cancelPendingAudioRequests(); }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    windowStage.loadContent('pages/Index', (error) => {
      if (error.code) {
        hilog.error(0x0000, 'CSTF', 'Failed to load main page: %{public}d', error.code);
        return;
      }
      if (deviceInfo.deviceType === 'phone') {
        windowStage.getMainWindow((windowError, mainWindow) => {
          if (windowError.code) {
            hilog.error(0x0000, 'CSTF', 'Failed to get phone window: %{public}d', windowError.code);
            return;
          }
          mainWindow.setPreferredOrientation(window.Orientation.LANDSCAPE).catch((orientationError: Error) => {
            hilog.error(0x0000, 'CSTF', 'Failed to lock phone landscape: %{public}s', orientationError.message);
          });
        });
      }
    });
  }
}