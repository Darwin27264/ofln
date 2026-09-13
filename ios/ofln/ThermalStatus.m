#import <React/RCTBridgeModule.h>
#import <Foundation/Foundation.h>

@interface ThermalStatus : NSObject <RCTBridgeModule>
@end

@implementation ThermalStatus

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_EXPORT_METHOD(getThermalState:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  (void)reject;
  NSProcessInfoThermalState state = NSProcessInfo.processInfo.thermalState;
  NSString *level = @"unknown";
  switch (state) {
    case NSProcessInfoThermalStateNominal:
      level = @"nominal";
      break;
    case NSProcessInfoThermalStateFair:
      level = @"fair";
      break;
    case NSProcessInfoThermalStateSerious:
      level = @"serious";
      break;
    case NSProcessInfoThermalStateCritical:
      level = @"critical";
      break;
    default:
      level = @"unknown";
      break;
  }
  resolve(level);
}

@end
