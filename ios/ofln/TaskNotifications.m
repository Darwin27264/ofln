#import <React/RCTBridgeModule.h>
#import <UserNotifications/UserNotifications.h>

@interface TaskNotifications : NSObject <RCTBridgeModule>
@end

@implementation TaskNotifications

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

static BOOL OflnNotificationsGranted(UNAuthorizationStatus status)
{
  return status == UNAuthorizationStatusAuthorized
    || status == UNAuthorizationStatusProvisional
    || status == UNAuthorizationStatusEphemeral;
}

RCT_EXPORT_METHOD(checkPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
    resolve(@(OflnNotificationsGranted(settings.authorizationStatus)));
  }];
}

RCT_EXPORT_METHOD(requestPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  UNAuthorizationOptions options = UNAuthorizationOptionAlert | UNAuthorizationOptionSound;
  [center requestAuthorizationWithOptions:options completionHandler:^(BOOL granted, NSError *error) {
    if (error != nil) {
      reject(@"E_NOTIF", error.localizedDescription, error);
      return;
    }
    resolve(@(granted));
  }];
}

RCT_EXPORT_METHOD(postNotification:(NSString *)title
                  message:(NSString *)message
                  taskId:(NSString *)taskId
                  runId:(NSString *)runId
                  isSuccess:(BOOL)isSuccess
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  (void)isSuccess;
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
    if (!OflnNotificationsGranted(settings.authorizationStatus)) {
      resolve(@(NO));
      return;
    }

    UNMutableNotificationContent *content = [UNMutableNotificationContent new];
    content.title = title ?: @"";
    content.body = message ?: @"";
    content.sound = [UNNotificationSound defaultSound];

    NSString *identifier = runId.length > 0 ? runId : (taskId.length > 0 ? taskId : [[NSUUID UUID] UUIDString]);
    UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:identifier
                                                                          content:content
                                                                          trigger:nil];
    [center addNotificationRequest:request withCompletionHandler:^(NSError *error) {
      resolve(@(error == nil));
    }];
  }];
}

@end
