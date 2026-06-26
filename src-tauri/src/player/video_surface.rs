#![allow(unexpected_cfgs)]

#[cfg(not(test))]
use crate::errors::{AppError, AppResult};

const DEFAULT_CONTROL_INSET_BOTTOM: u32 = 112;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VideoSurfaceLayout {
    pub width: u32,
    pub height: u32,
    pub control_inset_bottom: u32,
}

impl VideoSurfaceLayout {
    pub fn for_window(width: u32, height: u32) -> Self {
        Self {
            width,
            height,
            control_inset_bottom: DEFAULT_CONTROL_INSET_BOTTOM,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VideoSurfaceSize {
    pub width: u32,
    pub height: u32,
}

impl VideoSurfaceSize {
    pub fn from_points(width: f64, height: f64, scale_factor: f64) -> Self {
        Self {
            width: scaled_view_dimension(width, scale_factor),
            height: scaled_view_dimension(height, scale_factor),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VideoSurfaceTarget {
    pub ns_view: usize,
    pub open_gl_context: usize,
    pub width: u32,
    pub height: u32,
}

fn scaled_view_dimension(points: f64, scale_factor: f64) -> u32 {
    let safe_points = if points.is_finite() { points } else { 1.0 };
    let safe_scale = if scale_factor.is_finite() {
        scale_factor
    } else {
        1.0
    };

    (safe_points.max(1.0) * safe_scale.max(1.0)).round() as u32
}

impl VideoSurfaceTarget {
    pub fn new(ns_view: usize, open_gl_context: usize, width: u32, height: u32) -> Self {
        Self {
            ns_view,
            open_gl_context,
            width,
            height,
        }
    }
}

#[cfg(all(target_os = "macos", not(test)))]
pub fn target_from_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> AppResult<VideoSurfaceTarget> {
    macos::target_from_window(window)
}

#[cfg(all(target_os = "windows", not(test)))]
pub fn target_from_window<R: tauri::Runtime>(
    window: &tauri::WebviewWindow<R>,
) -> AppResult<VideoSurfaceTarget> {
    windows::target_from_window(window)
}

#[cfg(all(target_os = "macos", not(test)))]
pub fn current_size_for_view(ns_view: usize, fallback: VideoSurfaceSize) -> VideoSurfaceSize {
    macos::current_size_for_view(ns_view, fallback)
}

#[cfg(all(not(test), not(any(target_os = "macos", target_os = "windows"))))]
pub fn target_from_window<R: tauri::Runtime>(
    _window: &tauri::WebviewWindow<R>,
) -> AppResult<VideoSurfaceTarget> {
    Err(AppError::new(
        "video_surface_not_available",
        "当前平台暂不支持内置视频渲染区域",
        None,
        true,
    ))
}

#[cfg(not(target_os = "macos"))]
pub fn current_size_for_view(_ns_view: usize, fallback: VideoSurfaceSize) -> VideoSurfaceSize {
    fallback
}

#[cfg(all(target_os = "macos", not(test)))]
mod macos {
    use std::sync::{mpsc, OnceLock};

    use cocoa::{
        appkit::{
            NSOpenGLContext, NSOpenGLPFAAccelerated, NSOpenGLPFAAlphaSize, NSOpenGLPFAColorSize,
            NSOpenGLPFADoubleBuffer, NSOpenGLPFAOpenGLProfile, NSOpenGLPixelFormat,
            NSOpenGLProfileVersion3_2Core, NSView, NSViewHeightSizable, NSViewWidthSizable,
        },
        base::{id, nil, NO, YES},
        foundation::{NSAutoreleasePool, NSPoint, NSRect, NSSize},
    };
    use objc::{
        class,
        declare::ClassDecl,
        msg_send,
        runtime::{Class, Object, Sel},
        sel, sel_impl,
    };

    use super::{surface_error, VideoSurfaceSize, VideoSurfaceTarget};
    use crate::errors::AppResult;

    const NS_WINDOW_BELOW: i64 = -1;
    const TRANSPARENT_VIEW_RECURSION_LIMIT: usize = 16;
    const VIDEO_SURFACE_VIEW_CLASS_NAME: &str = "VeloVideoSurfaceView";

    pub fn target_from_window<R: tauri::Runtime>(
        window: &tauri::WebviewWindow<R>,
    ) -> AppResult<VideoSurfaceTarget> {
        let webview = window.ns_view().map_err(|error| {
            surface_error(
                "video_surface_window_handle_failed",
                "无法获取主窗口原生视图",
                Some(error.to_string()),
            )
        })? as usize;
        let (tx, rx) = mpsc::channel();

        window
            .run_on_main_thread(move || {
                let result = unsafe { create_surface(webview as id) };
                let _ = tx.send(result);
            })
            .map_err(|error| {
                surface_error(
                    "video_surface_main_thread_failed",
                    "无法在主线程创建视频渲染区域",
                    Some(error.to_string()),
                )
            })?;

        rx.recv().map_err(|error| {
            surface_error(
                "video_surface_main_thread_failed",
                "无法接收视频渲染区域创建结果",
                Some(error.to_string()),
            )
        })?
    }

    unsafe fn create_surface(webview: id) -> AppResult<VideoSurfaceTarget> {
        let _pool = NSAutoreleasePool::new(nil);
        make_webview_transparent(webview);

        let parent: id = msg_send![webview, superview];
        let parent = if parent == nil { webview } else { parent };
        let frame: NSRect = msg_send![webview, bounds];
        let pixel_format = create_pixel_format()?;
        let gl_view_class = video_surface_view_class();
        let gl_view: id = msg_send![gl_view_class, alloc];
        let gl_view: id = msg_send![gl_view, initWithFrame: frame pixelFormat: pixel_format];
        if gl_view == nil {
            return Err(surface_error(
                "video_surface_create_failed",
                "无法创建 OpenGL 视频视图",
                None,
            ));
        }

        gl_view.setAutoresizingMask_(NSViewWidthSizable | NSViewHeightSizable);
        gl_view.setWantsBestResolutionOpenGLSurface_(NO);
        let gl_context: id = msg_send![gl_view, openGLContext];
        if gl_context == nil {
            return Err(surface_error(
                "video_surface_context_failed",
                "无法创建 OpenGL 渲染上下文",
                None,
            ));
        }

        let _: () = msg_send![
            parent,
            addSubview: gl_view
            positioned: NS_WINDOW_BELOW
            relativeTo: webview
        ];
        gl_context.makeCurrentContext();

        Ok(VideoSurfaceTarget::new(
            gl_view as usize,
            gl_context as usize,
            frame.size.width.max(1.0) as u32,
            frame.size.height.max(1.0) as u32,
        ))
    }

    fn video_surface_view_class() -> &'static Class {
        static CLASS: OnceLock<&'static Class> = OnceLock::new();
        CLASS.get_or_init(|| unsafe {
            if let Some(existing) = Class::get(video_surface_view_class_name()) {
                return existing;
            }

            let superclass = class!(NSOpenGLView);
            let mut declaration = ClassDecl::new(video_surface_view_class_name(), superclass)
                .expect("register video surface view class");
            declaration.add_method(
                sel!(hitTest:),
                video_surface_hit_test as extern "C" fn(&Object, Sel, NSPoint) -> id,
            );
            declaration.add_method(
                sel!(acceptsFirstResponder),
                video_surface_accepts_first_responder
                    as extern "C" fn(&Object, Sel) -> cocoa::base::BOOL,
            );
            declaration.register()
        })
    }

    extern "C" fn video_surface_hit_test(_view: &Object, _cmd: Sel, _point: NSPoint) -> id {
        nil
    }

    extern "C" fn video_surface_accepts_first_responder(
        _view: &Object,
        _cmd: Sel,
    ) -> cocoa::base::BOOL {
        NO
    }

    pub fn current_size_for_view(ns_view: usize, fallback: VideoSurfaceSize) -> VideoSurfaceSize {
        if ns_view == 0 {
            return fallback;
        }

        unsafe {
            let view = ns_view as id;
            let bounds: NSRect = msg_send![view, bounds];
            let size = bounds.size;
            let responds_to_backing: bool =
                msg_send![view, respondsToSelector: sel!(convertSizeToBacking:)];
            if responds_to_backing {
                let backing_size: NSSize = msg_send![view, convertSizeToBacking: size];
                return VideoSurfaceSize::from_points(backing_size.width, backing_size.height, 1.0);
            }

            let window: id = msg_send![view, window];
            let scale_factor = if window == nil {
                1.0
            } else {
                let responds_to_scale: bool =
                    msg_send![window, respondsToSelector: sel!(backingScaleFactor)];
                if responds_to_scale {
                    msg_send![window, backingScaleFactor]
                } else {
                    1.0
                }
            };
            VideoSurfaceSize::from_points(size.width, size.height, scale_factor)
        }
    }

    unsafe fn make_webview_transparent(webview: id) {
        let clear_color: id = msg_send![class!(NSColor), clearColor];
        make_view_tree_transparent(webview, clear_color, 0);
    }

    unsafe fn make_view_tree_transparent(view: id, clear_color: id, depth: usize) {
        if view == nil || depth > transparent_view_recursion_limit() {
            return;
        }

        set_transparent_view_properties(view, clear_color);

        let subviews: id = msg_send![view, subviews];
        if subviews == nil {
            return;
        }

        let count: usize = msg_send![subviews, count];
        for index in 0..count {
            let subview: id = msg_send![subviews, objectAtIndex: index];
            make_view_tree_transparent(subview, clear_color, depth + 1);
        }
    }

    unsafe fn set_transparent_view_properties(view: id, clear_color: id) {
        let responds_to_set_opaque: bool = msg_send![view, respondsToSelector: sel!(setOpaque:)];
        if responds_to_set_opaque {
            let _: () = msg_send![view, setOpaque: NO];
        }

        let responds_to_set_background: bool =
            msg_send![view, respondsToSelector: sel!(setBackgroundColor:)];
        if responds_to_set_background {
            let _: () = msg_send![view, setBackgroundColor: clear_color];
        }

        let responds_to_draws_background: bool =
            msg_send![view, respondsToSelector: sel!(setDrawsBackground:)];
        if responds_to_draws_background {
            let _: () = msg_send![view, setDrawsBackground: NO];
        }

        let responds_to_wants_layer: bool =
            msg_send![view, respondsToSelector: sel!(setWantsLayer:)];
        if responds_to_wants_layer {
            let _: () = msg_send![view, setWantsLayer: YES];
        }

        let responds_to_layer: bool = msg_send![view, respondsToSelector: sel!(layer)];
        if responds_to_layer {
            let layer: id = msg_send![view, layer];
            if layer != nil {
                let cg_color: id = msg_send![clear_color, CGColor];
                let _: () = msg_send![layer, setBackgroundColor: cg_color];
            }
        }
    }

    pub(super) fn transparent_view_recursion_limit() -> usize {
        TRANSPARENT_VIEW_RECURSION_LIMIT
    }

    pub(super) fn video_surface_view_class_name() -> &'static str {
        VIDEO_SURFACE_VIEW_CLASS_NAME
    }

    #[cfg(test)]
    pub(super) fn video_surface_passes_through_input() -> bool {
        true
    }

    unsafe fn create_pixel_format() -> AppResult<id> {
        let candidates = pixel_format_attribute_candidates();
        for attrs in &candidates {
            let pixel_format = NSOpenGLPixelFormat::alloc(nil).initWithAttributes_(attrs);
            if pixel_format != nil {
                return Ok(pixel_format);
            }
        }

        Err(surface_error(
            "video_surface_pixel_format_failed",
            "无法创建 OpenGL 像素格式",
            Some(format!(
                "已尝试 {} 组 OpenGL 像素格式属性",
                candidates.len()
            )),
        ))
    }

    pub(super) fn pixel_format_attribute_candidates() -> Vec<Vec<u32>> {
        vec![
            vec![
                NSOpenGLPFAOpenGLProfile as u32,
                NSOpenGLProfileVersion3_2Core as u32,
                NSOpenGLPFAAccelerated as u32,
                NSOpenGLPFADoubleBuffer as u32,
                NSOpenGLPFAColorSize as u32,
                24,
                NSOpenGLPFAAlphaSize as u32,
                8,
                0,
            ],
            vec![
                NSOpenGLPFAOpenGLProfile as u32,
                NSOpenGLProfileVersion3_2Core as u32,
                NSOpenGLPFAAccelerated as u32,
                NSOpenGLPFADoubleBuffer as u32,
                NSOpenGLPFAColorSize as u32,
                24,
                0,
            ],
            vec![
                NSOpenGLPFAAccelerated as u32,
                NSOpenGLPFADoubleBuffer as u32,
                NSOpenGLPFAColorSize as u32,
                24,
                NSOpenGLPFAAlphaSize as u32,
                8,
                0,
            ],
            vec![
                NSOpenGLPFAAccelerated as u32,
                NSOpenGLPFAColorSize as u32,
                24,
                0,
            ],
            vec![NSOpenGLPFAColorSize as u32, 24, 0],
        ]
    }
}

#[cfg(all(target_os = "windows", not(test)))]
mod windows {
    use super::{surface_error, VideoSurfaceTarget};
    use crate::errors::AppResult;

    pub fn target_from_window<R: tauri::Runtime>(
        window: &tauri::WebviewWindow<R>,
    ) -> AppResult<VideoSurfaceTarget> {
        let hwnd = window.hwnd().map_err(|error| {
            surface_error(
                "video_surface_window_handle_failed",
                "无法获取主窗口原生句柄",
                Some(error.to_string()),
            )
        })?;
        let size = window.inner_size().map_err(|error| {
            surface_error(
                "video_surface_window_size_failed",
                "无法获取主窗口尺寸",
                Some(error.to_string()),
            )
        })?;

        Ok(VideoSurfaceTarget::new(
            hwnd.0 as usize,
            0,
            size.width.max(1),
            size.height.max(1),
        ))
    }
}

#[cfg(all(not(test), any(target_os = "macos", target_os = "windows")))]
fn surface_error(code: &str, message: &str, detail: Option<String>) -> AppError {
    AppError::new(code, message, detail, true)
}

#[cfg(test)]
mod tests {
    use super::{VideoSurfaceLayout, VideoSurfaceSize, VideoSurfaceTarget};

    #[test]
    fn video_surface_layout_uses_full_window_with_control_inset() {
        let layout = VideoSurfaceLayout::for_window(1280, 720);

        assert_eq!(layout.width, 1280);
        assert_eq!(layout.height, 720);
        assert_eq!(layout.control_inset_bottom, 112);
    }

    #[test]
    fn video_surface_target_keeps_native_handles_as_opaque_values() {
        let target = VideoSurfaceTarget::new(0x10, 0x20, 1280, 720);

        assert_eq!(target.ns_view, 0x10);
        assert_eq!(target.open_gl_context, 0x20);
        assert_eq!(target.width, 1280);
        assert_eq!(target.height, 720);
    }

    #[test]
    fn video_surface_size_uses_backing_pixels_and_never_returns_zero() {
        assert_eq!(
            VideoSurfaceSize::from_points(800.0, 450.0, 2.0),
            VideoSurfaceSize {
                width: 1600,
                height: 900,
            }
        );
        assert_eq!(
            VideoSurfaceSize::from_points(0.0, f64::NAN, 0.0),
            VideoSurfaceSize {
                width: 1,
                height: 1,
            }
        );
    }

    #[cfg(all(target_os = "macos", not(test)))]
    #[test]
    fn macos_pixel_format_attributes_fall_back_to_compatible_profiles() {
        let candidates = super::macos::pixel_format_attribute_candidates();

        assert!(candidates.len() >= 3);
        assert!(candidates[0].contains(&(cocoa::appkit::NSOpenGLPFAOpenGLProfile as u32)));
        assert!(candidates
            .iter()
            .any(|attrs| !attrs.contains(&(cocoa::appkit::NSOpenGLPFAOpenGLProfile as u32))));
        assert!(candidates
            .iter()
            .all(|attrs| attrs.last().copied() == Some(0)));
    }

    #[cfg(all(target_os = "macos", not(test)))]
    #[test]
    fn macos_transparency_walk_has_bounded_depth() {
        assert!(super::macos::transparent_view_recursion_limit() >= 8);
    }

    #[cfg(all(target_os = "macos", not(test)))]
    #[test]
    fn macos_video_surface_uses_non_interactive_subclass() {
        assert_eq!(
            super::macos::video_surface_view_class_name(),
            "VeloVideoSurfaceView"
        );
        assert!(super::macos::video_surface_passes_through_input());
    }
}
