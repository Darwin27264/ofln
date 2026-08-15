#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

@interface SystemBars : NSObject <RCTBridgeModule>
@end

@implementation SystemBars

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

static UIColor *OflnColorFromHex(NSString *hex)
{
  NSString *c = [[hex stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]] uppercaseString];
  if (c.length == 0 || [c caseInsensitiveCompare:@"transparent"] == NSOrderedSame) {
    return [UIColor clearColor];
  }
  if ([c hasPrefix:@"#"]) {
    c = [c substringFromIndex:1];
  }
  if (c.length == 8) {
    c = [c substringFromIndex:2];
  }
  if (c.length != 6) {
    return [UIColor clearColor];
  }
  unsigned int rgb = 0;
  [[NSScanner scannerWithString:c] scanHexInt:&rgb];
  return [UIColor colorWithRed:((rgb >> 16) & 0xFF) / 255.0
                         green:((rgb >> 8) & 0xFF) / 255.0
                          blue:(rgb & 0xFF) / 255.0
                         alpha:1.0];
}

RCT_EXPORT_METHOD(setSystemBarColors:(NSString *)statusColor
                  navColor:(NSString *)navColor
                  darkIcons:(BOOL)darkIcons)
{
  (void)statusColor;
  (void)darkIcons;
  UIColor *fill = OflnColorFromHex(navColor);
  dispatch_async(dispatch_get_main_queue(), ^{
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
      if (![scene isKindOfClass:[UIWindowScene class]]) {
        continue;
      }
      for (UIWindow *window in ((UIWindowScene *)scene).windows) {
        window.backgroundColor = fill;
        window.rootViewController.view.backgroundColor = fill;
      }
    }
  });
}

@end
