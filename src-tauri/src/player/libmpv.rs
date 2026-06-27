use std::{
    ffi::{c_char, c_double, c_int, c_void, CString},
    path::{Path, PathBuf},
    ptr::NonNull,
};
#[cfg(target_os = "macos")]
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, OnceLock,
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use libloading::Library;

#[cfg(target_os = "macos")]
use cocoa::base::{id, nil, YES};
#[cfg(target_os = "macos")]
use objc::{class, msg_send, sel, sel_impl};

#[cfg(target_os = "macos")]
use crate::player::video_surface::{current_size_for_view, VideoSurfaceSize};
use crate::{
    errors::{AppError, AppResult},
    player::backend::{
        FakePlayerBackend, HardwareDecoder, PlaybackBufferProfile, PlaybackLoadOptions,
        PlaybackSnapshot, PlayerBackend,
    },
    player::cache::playback_cache_dir,
    player::video_surface::VideoSurfaceTarget,
    player::window_fit::mpv_autofit_larger_value,
};

#[cfg(any(target_os = "macos", target_os = "windows"))]
use crate::player::backend::UnavailablePlayerBackend;
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
use crate::player::mpv::ExternalMpvBackend;

type MpvHandle = c_void;
#[cfg(target_os = "macos")]
type MpvRenderContext = c_void;
type MpvCreate = unsafe extern "C" fn() -> *mut MpvHandle;
type MpvInitialize = unsafe extern "C" fn(*mut MpvHandle) -> c_int;
type MpvDestroy = unsafe extern "C" fn(*mut MpvHandle);
type MpvCommand = unsafe extern "C" fn(*mut MpvHandle, *const *const c_char) -> c_int;
type MpvCommandAsync = unsafe extern "C" fn(*mut MpvHandle, u64, *const *const c_char) -> c_int;
type MpvSetOptionString =
    unsafe extern "C" fn(*mut MpvHandle, *const c_char, *const c_char) -> c_int;
type MpvSetProperty =
    unsafe extern "C" fn(*mut MpvHandle, *const c_char, c_int, *mut c_void) -> c_int;
type MpvGetProperty =
    unsafe extern "C" fn(*mut MpvHandle, *const c_char, c_int, *mut c_void) -> c_int;
#[cfg(target_os = "macos")]
type MpvRenderContextCreate =
    unsafe extern "C" fn(*mut *mut MpvRenderContext, *mut MpvHandle, *mut MpvRenderParam) -> c_int;
#[cfg(target_os = "macos")]
type MpvRenderContextUpdate = unsafe extern "C" fn(*mut MpvRenderContext) -> u64;
#[cfg(target_os = "macos")]
type MpvRenderContextRender =
    unsafe extern "C" fn(*mut MpvRenderContext, *mut MpvRenderParam) -> c_int;
#[cfg(target_os = "macos")]
type MpvRenderContextReportSwap = unsafe extern "C" fn(*mut MpvRenderContext);
#[cfg(target_os = "macos")]
type MpvRenderContextFree = unsafe extern "C" fn(*mut MpvRenderContext);
#[cfg(target_os = "macos")]
type GlViewport = unsafe extern "C" fn(c_int, c_int, c_int, c_int);

const MPV_FORMAT_FLAG: c_int = 3;
const MPV_FORMAT_DOUBLE: c_int = 5;
#[cfg(target_os = "macos")]
const MPV_RENDER_PARAM_INVALID: c_int = 0;
#[cfg(target_os = "macos")]
const MPV_RENDER_PARAM_API_TYPE: c_int = 1;
#[cfg(target_os = "macos")]
const MPV_RENDER_PARAM_OPENGL_INIT_PARAMS: c_int = 2;
#[cfg(target_os = "macos")]
const MPV_RENDER_PARAM_OPENGL_FBO: c_int = 3;
#[cfg(target_os = "macos")]
const MPV_RENDER_PARAM_FLIP_Y: c_int = 4;
#[cfg(target_os = "macos")]
const MPV_RENDER_UPDATE_FRAME: u64 = 1;
#[cfg(target_os = "macos")]
const GL_RGBA8: c_int = 0x8058;
#[cfg(target_os = "macos")]
const MPV_RENDER_API_TYPE_OPENGL: &[u8] = b"opengl\0";
#[cfg(target_os = "macos")]
const RENDER_WATCHDOG_TICKS: u32 = 30;
const STARTUP_CACHE_SECONDS: u32 = 15;
const STEADY_CACHE_SECONDS: u32 = 30;

#[cfg(target_os = "macos")]
#[repr(C)]
struct MpvRenderParam {
    param_type: c_int,
    data: *mut c_void,
}

#[cfg(target_os = "macos")]
#[repr(C)]
struct MpvOpenGlInitParams {
    get_proc_address:
        Option<unsafe extern "C" fn(ctx: *mut c_void, name: *const c_char) -> *mut c_void>,
    get_proc_address_ctx: *mut c_void,
}

#[cfg(target_os = "macos")]
#[repr(C)]
struct MpvOpenGlFbo {
    fbo: c_int,
    w: c_int,
    h: c_int,
    internal_format: c_int,
}

#[cfg(target_os = "macos")]
fn open_gl_api_type_param() -> MpvRenderParam {
    MpvRenderParam {
        param_type: MPV_RENDER_PARAM_API_TYPE,
        data: MPV_RENDER_API_TYPE_OPENGL
            .as_ptr()
            .cast::<c_void>()
            .cast_mut(),
    }
}

pub struct LibMpvBackend {
    _library: Library,
    symbols: LibMpvSymbols,
    handle: NonNull<MpvHandle>,
    #[cfg(target_os = "macos")]
    renderer: Option<MpvOpenGlRenderer>,
    initialized: bool,
    video_surface_attached: bool,
    snapshot: PlaybackSnapshot,
}

// AppState 通过 Mutex 串行访问播放器后端，libmpv handle 不会被并发调用。
unsafe impl Send for LibMpvBackend {}

struct LibMpvSymbols {
    mpv_initialize: MpvInitialize,
    mpv_destroy: MpvDestroy,
    mpv_command: MpvCommand,
    mpv_command_async: MpvCommandAsync,
    mpv_get_property: MpvGetProperty,
    mpv_set_option_string: MpvSetOptionString,
    mpv_set_property: MpvSetProperty,
    #[cfg(target_os = "macos")]
    mpv_render_context_create: MpvRenderContextCreate,
    #[cfg(target_os = "macos")]
    mpv_render_context_update: MpvRenderContextUpdate,
    #[cfg(target_os = "macos")]
    mpv_render_context_render: MpvRenderContextRender,
    #[cfg(target_os = "macos")]
    mpv_render_context_report_swap: MpvRenderContextReportSwap,
    #[cfg(target_os = "macos")]
    mpv_render_context_free: MpvRenderContextFree,
}

impl LibMpvBackend {
    pub fn new() -> AppResult<Self> {
        let mut last_error = None;
        for candidate in libmpv_library_candidates() {
            match unsafe { Library::new(&candidate) } {
                Ok(library) => return Self::from_library(library),
                Err(error) => last_error = Some(format!("{candidate}: {error}")),
            }
        }

        Err(AppError::new(
            "libmpv_not_available",
            "未找到内置 libmpv 运行时，请检查应用安装包是否完整",
            last_error,
            true,
        ))
    }

    fn from_library(library: Library) -> AppResult<Self> {
        let mpv_create: MpvCreate =
            *unsafe { library.get::<MpvCreate>(b"mpv_create\0") }.map_err(libmpv_symbol_error)?;
        let mpv_initialize: MpvInitialize =
            *unsafe { library.get::<MpvInitialize>(b"mpv_initialize\0") }
                .map_err(libmpv_symbol_error)?;
        let mpv_destroy: MpvDestroy =
            *unsafe { library.get::<MpvDestroy>(b"mpv_destroy\0") }.map_err(libmpv_symbol_error)?;
        let mpv_command: MpvCommand =
            *unsafe { library.get::<MpvCommand>(b"mpv_command\0") }.map_err(libmpv_symbol_error)?;
        let mpv_command_async: MpvCommandAsync =
            *unsafe { library.get::<MpvCommandAsync>(b"mpv_command_async\0") }
                .map_err(libmpv_symbol_error)?;
        let mpv_set_option_string: MpvSetOptionString =
            *unsafe { library.get::<MpvSetOptionString>(b"mpv_set_option_string\0") }
                .map_err(libmpv_symbol_error)?;
        let mpv_set_property: MpvSetProperty =
            *unsafe { library.get::<MpvSetProperty>(b"mpv_set_property\0") }
                .map_err(libmpv_symbol_error)?;
        let mpv_get_property: MpvGetProperty =
            *unsafe { library.get::<MpvGetProperty>(b"mpv_get_property\0") }
                .map_err(libmpv_symbol_error)?;
        #[cfg(target_os = "macos")]
        let mpv_render_context_create: MpvRenderContextCreate =
            *unsafe { library.get::<MpvRenderContextCreate>(b"mpv_render_context_create\0") }
                .map_err(libmpv_symbol_error)?;
        #[cfg(target_os = "macos")]
        let mpv_render_context_update: MpvRenderContextUpdate =
            *unsafe { library.get::<MpvRenderContextUpdate>(b"mpv_render_context_update\0") }
                .map_err(libmpv_symbol_error)?;
        #[cfg(target_os = "macos")]
        let mpv_render_context_render: MpvRenderContextRender =
            *unsafe { library.get::<MpvRenderContextRender>(b"mpv_render_context_render\0") }
                .map_err(libmpv_symbol_error)?;
        #[cfg(target_os = "macos")]
        let mpv_render_context_report_swap: MpvRenderContextReportSwap = *unsafe {
            library.get::<MpvRenderContextReportSwap>(b"mpv_render_context_report_swap\0")
        }
        .map_err(libmpv_symbol_error)?;
        #[cfg(target_os = "macos")]
        let mpv_render_context_free: MpvRenderContextFree =
            *unsafe { library.get::<MpvRenderContextFree>(b"mpv_render_context_free\0") }
                .map_err(libmpv_symbol_error)?;

        let handle = NonNull::new(unsafe { mpv_create() }).ok_or_else(|| {
            AppError::new(
                "libmpv_create_failed",
                "libmpv 播放器初始化失败",
                None,
                true,
            )
        })?;

        set_option_string(
            mpv_set_option_string,
            handle,
            "input-default-bindings",
            "yes",
        )?;
        set_option_string(mpv_set_option_string, handle, "osc", "no")?;
        set_option_string(mpv_set_option_string, handle, "vo", default_video_output())?;
        configure_disk_cache(mpv_set_option_string, handle)?;
        // 百分比由 mpv 按当前显示器解析，避免高分辨率视频把初始窗口撑出屏幕。
        set_option_string(
            mpv_set_option_string,
            handle,
            "autofit-larger",
            &mpv_autofit_larger_value(),
        )?;

        Ok(Self {
            _library: library,
            symbols: LibMpvSymbols {
                mpv_initialize,
                mpv_destroy,
                mpv_command,
                mpv_command_async,
                mpv_get_property,
                mpv_set_option_string,
                mpv_set_property,
                #[cfg(target_os = "macos")]
                mpv_render_context_create,
                #[cfg(target_os = "macos")]
                mpv_render_context_update,
                #[cfg(target_os = "macos")]
                mpv_render_context_render,
                #[cfg(target_os = "macos")]
                mpv_render_context_report_swap,
                #[cfg(target_os = "macos")]
                mpv_render_context_free,
            },
            handle,
            #[cfg(target_os = "macos")]
            renderer: None,
            initialized: false,
            video_surface_attached: false,
            snapshot: PlaybackSnapshot::default(),
        })
    }

    #[cfg(target_os = "macos")]
    fn clear_renderer(&mut self) {
        self.renderer = None;
    }

    #[cfg(not(target_os = "macos"))]
    fn clear_renderer(&mut self) {}

    fn initialize(&mut self) -> AppResult<()> {
        if self.initialized {
            return Ok(());
        }

        let code = unsafe { (self.symbols.mpv_initialize)(self.handle.as_ptr()) };
        if code < 0 {
            return Err(mpv_error("mpv_initialize", code));
        }
        self.initialized = true;
        Ok(())
    }

    fn command(&self, args: &[&str]) -> AppResult<()> {
        let cstrings = args
            .iter()
            .map(|arg| CString::new(*arg))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| {
                AppError::new(
                    "libmpv_command_invalid",
                    "libmpv 命令参数无效",
                    Some(error.to_string()),
                    true,
                )
            })?;
        let mut pointers = cstrings
            .iter()
            .map(|arg| arg.as_ptr())
            .collect::<Vec<*const c_char>>();
        pointers.push(std::ptr::null());

        let code = unsafe { (self.symbols.mpv_command)(self.handle.as_ptr(), pointers.as_ptr()) };
        if code < 0 {
            return Err(mpv_error("mpv_command", code));
        }
        Ok(())
    }

    fn command_async(&self, args: &[&str]) -> AppResult<()> {
        let cstrings = args
            .iter()
            .map(|arg| CString::new(*arg))
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| {
                AppError::new(
                    "libmpv_command_invalid",
                    "libmpv 命令参数无效",
                    Some(error.to_string()),
                    true,
                )
            })?;
        let mut pointers = cstrings
            .iter()
            .map(|arg| arg.as_ptr())
            .collect::<Vec<*const c_char>>();
        pointers.push(std::ptr::null());

        let code =
            unsafe { (self.symbols.mpv_command_async)(self.handle.as_ptr(), 0, pointers.as_ptr()) };
        if code < 0 {
            return Err(mpv_error("mpv_command_async", code));
        }
        Ok(())
    }

    fn get_property_double(&self, name: &str) -> AppResult<Option<f64>> {
        let mut value: c_double = 0.0;
        match get_property(
            self.symbols.mpv_get_property,
            self.handle,
            name,
            MPV_FORMAT_DOUBLE,
            (&mut value as *mut c_double).cast(),
        ) {
            Ok(()) => Ok(Some(value)),
            Err(error) if error.code == "libmpv_property_unavailable" => Ok(None),
            Err(error) => Err(error),
        }
    }

    fn get_property_flag(&self, name: &str) -> AppResult<Option<bool>> {
        let mut value: c_int = 0;
        match get_property(
            self.symbols.mpv_get_property,
            self.handle,
            name,
            MPV_FORMAT_FLAG,
            (&mut value as *mut c_int).cast(),
        ) {
            Ok(()) => Ok(Some(value != 0)),
            Err(error) if error.code == "libmpv_property_unavailable" => Ok(None),
            Err(error) => Err(error),
        }
    }
}

impl PlayerBackend for LibMpvBackend {
    fn attach_video_surface(&mut self, target: VideoSurfaceTarget) -> AppResult<()> {
        self.clear_renderer();
        attach_native_video_surface(self, target)?;
        self.video_surface_attached = true;
        Ok(())
    }

    fn load(&mut self, options: PlaybackLoadOptions) -> AppResult<()> {
        if !self.video_surface_attached {
            return Err(AppError::new(
                "libmpv_render_surface_missing",
                "未创建应用内视频渲染区域",
                None,
                true,
            ));
        }
        let hwdec = hwdec_option(&options.hwdec);
        self.command(&["set", "hwdec", hwdec])?;
        self.command(&["loadfile", &options.url, "replace"])?;
        self.set_paused(options.start_paused)?;
        self.snapshot.loaded_url = Some(options.url);
        Ok(())
    }

    fn stop(&mut self) -> AppResult<()> {
        if !self.initialized {
            self.clear_renderer();
            self.video_surface_attached = false;
            self.snapshot.loaded_url = None;
            self.snapshot.position_seconds = 0.0;
            self.snapshot.paused = false;
            return Ok(());
        }

        let result = self.command(&["stop"]);
        self.clear_renderer();
        self.video_surface_attached = false;
        self.snapshot.loaded_url = None;
        self.snapshot.position_seconds = 0.0;
        self.snapshot.paused = false;
        result
    }

    fn set_paused(&mut self, paused: bool) -> AppResult<()> {
        let mut value: c_int = if paused { 1 } else { 0 };
        set_property(
            self.symbols.mpv_set_property,
            self.handle,
            "pause",
            MPV_FORMAT_FLAG,
            (&mut value as *mut c_int).cast(),
        )?;
        self.snapshot.paused = paused;
        Ok(())
    }

    fn seek(&mut self, position_seconds: f64) -> AppResult<()> {
        self.command(&["seek", &position_seconds.to_string(), "absolute"])?;
        self.snapshot.position_seconds = position_seconds;
        Ok(())
    }

    fn set_speed(&mut self, speed: f64) -> AppResult<()> {
        let mut value: c_double = speed;
        set_property(
            self.symbols.mpv_set_property,
            self.handle,
            "speed",
            MPV_FORMAT_DOUBLE,
            (&mut value as *mut c_double).cast(),
        )?;
        self.snapshot.speed = speed;
        Ok(())
    }

    fn set_volume(&mut self, volume: u8) -> AppResult<()> {
        let mut value: c_double = f64::from(volume.min(100));
        set_property(
            self.symbols.mpv_set_property,
            self.handle,
            "volume",
            MPV_FORMAT_DOUBLE,
            (&mut value as *mut c_double).cast(),
        )?;
        self.snapshot.volume = volume.min(100);
        Ok(())
    }

    fn set_muted(&mut self, muted: bool) -> AppResult<()> {
        let mut value: c_int = if muted { 1 } else { 0 };
        set_property(
            self.symbols.mpv_set_property,
            self.handle,
            "mute",
            MPV_FORMAT_FLAG,
            (&mut value as *mut c_int).cast(),
        )?;
        self.snapshot.muted = muted;
        Ok(())
    }

    fn set_fullscreen(&mut self, fullscreen: bool) -> AppResult<()> {
        let value = if fullscreen { "yes" } else { "no" };
        self.command(&["set", "fullscreen", value])?;
        self.snapshot.fullscreen = fullscreen;
        Ok(())
    }

    fn load_subtitle(&mut self, path: &str) -> AppResult<()> {
        // 切换外挂字幕前先移除当前外挂轨道，避免多次 sub-add 后轨道堆积导致选中状态混乱。
        let _ = self.command(&["sub-remove", "current"]);
        // 远程字幕加载可能触发网络请求，必须进入 mpv 队列，避免阻塞暂停、停止、seek 等控制命令。
        self.command_async(&["sub-add", path, "cached"])?;
        Ok(())
    }

    fn select_embedded_subtitle(&mut self, stream_index: i64) -> AppResult<()> {
        self.command(&["set", "sid", &stream_index.to_string()])?;
        Ok(())
    }

    fn disable_subtitle(&mut self) -> AppResult<()> {
        self.command_async(&["set", "sid", "no"])?;
        Ok(())
    }

    fn set_buffer_profile(&mut self, profile: PlaybackBufferProfile) -> AppResult<()> {
        apply_buffer_profile(self.handle, self.symbols.mpv_set_property, profile)
    }

    fn snapshot(&self) -> PlaybackSnapshot {
        self.snapshot.clone()
    }

    fn runtime_status(&self) -> crate::player::backend::PlaybackRuntimeStatus {
        let position_seconds = self
            .get_property_double("playback-time")
            .ok()
            .flatten()
            .unwrap_or(self.snapshot.position_seconds);
        let duration_seconds = self
            .get_property_double("duration")
            .ok()
            .flatten()
            .filter(|duration| duration.is_finite() && *duration > 0.0);
        crate::player::backend::PlaybackRuntimeStatus {
            core_ready: self.video_surface_attached,
            media_loaded: self.snapshot.loaded_url.is_some(),
            paused: self.snapshot.paused,
            paused_for_cache: self
                .get_property_flag("paused-for-cache")
                .ok()
                .flatten()
                .unwrap_or(false),
            cache_speed_bytes_per_second: self.get_property_double("cache-speed").ok().flatten(),
            position_seconds,
            duration_seconds,
        }
    }
}

impl Drop for LibMpvBackend {
    fn drop(&mut self) {
        self.clear_renderer();
        self.video_surface_attached = false;
        unsafe { (self.symbols.mpv_destroy)(self.handle.as_ptr()) };
    }
}

#[cfg(target_os = "macos")]
fn attach_native_video_surface(
    backend: &mut LibMpvBackend,
    target: VideoSurfaceTarget,
) -> AppResult<()> {
    backend.initialize()?;
    backend.renderer = Some(MpvOpenGlRenderer::new(
        backend.handle,
        &backend.symbols,
        target,
    )?);
    Ok(())
}

#[cfg(target_os = "windows")]
fn attach_native_video_surface(
    backend: &mut LibMpvBackend,
    target: VideoSurfaceTarget,
) -> AppResult<()> {
    if !backend.initialized {
        set_option_string(
            backend.symbols.mpv_set_option_string,
            backend.handle,
            "wid",
            &target.ns_view.to_string(),
        )?;
    }
    backend.initialize()
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn attach_native_video_surface(
    _backend: &mut LibMpvBackend,
    _target: VideoSurfaceTarget,
) -> AppResult<()> {
    Err(AppError::new(
        "video_surface_not_available",
        "当前平台暂不支持内置视频渲染区域",
        None,
        true,
    ))
}

#[cfg(target_os = "macos")]
struct MpvOpenGlRenderer {
    render_context: NonNull<MpvRenderContext>,
    gl_view: usize,
    gl_context: usize,
    running: Arc<AtomicBool>,
    render_thread: Option<JoinHandle<()>>,
    mpv_render_context_free: MpvRenderContextFree,
}

#[cfg(target_os = "macos")]
unsafe impl Send for MpvOpenGlRenderer {}

#[cfg(target_os = "macos")]
impl MpvOpenGlRenderer {
    fn new(
        handle: NonNull<MpvHandle>,
        symbols: &LibMpvSymbols,
        target: VideoSurfaceTarget,
    ) -> AppResult<Self> {
        make_open_gl_context_current(target.open_gl_context);
        let mut init_params = MpvOpenGlInitParams {
            get_proc_address: Some(get_open_gl_proc_address),
            get_proc_address_ctx: std::ptr::null_mut(),
        };
        let mut params = [
            open_gl_api_type_param(),
            MpvRenderParam {
                param_type: MPV_RENDER_PARAM_OPENGL_INIT_PARAMS,
                data: (&mut init_params as *mut MpvOpenGlInitParams).cast(),
            },
            MpvRenderParam {
                param_type: MPV_RENDER_PARAM_INVALID,
                data: std::ptr::null_mut(),
            },
        ];
        let mut render_context = std::ptr::null_mut();
        let code = unsafe {
            (symbols.mpv_render_context_create)(
                &mut render_context,
                handle.as_ptr(),
                params.as_mut_ptr(),
            )
        };
        if code < 0 {
            return Err(mpv_error("mpv_render_context_create", code));
        }

        let render_context = NonNull::new(render_context).ok_or_else(|| {
            AppError::new(
                "libmpv_render_init_failed",
                "libmpv 渲染上下文初始化失败",
                None,
                true,
            )
        })?;
        let running = Arc::new(AtomicBool::new(true));
        let render_thread = spawn_render_thread(
            render_context,
            target,
            Arc::clone(&running),
            symbols.mpv_render_context_update,
            symbols.mpv_render_context_render,
            symbols.mpv_render_context_report_swap,
        );

        Ok(Self {
            render_context,
            gl_view: target.ns_view,
            gl_context: target.open_gl_context,
            running,
            render_thread: Some(render_thread),
            mpv_render_context_free: symbols.mpv_render_context_free,
        })
    }
}

#[cfg(target_os = "macos")]
impl Drop for MpvOpenGlRenderer {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(thread) = self.render_thread.take() {
            let _ = thread.join();
        }
        unsafe {
            make_open_gl_context_current(self.gl_context);
            (self.mpv_render_context_free)(self.render_context.as_ptr());
            remove_video_view(self.gl_view);
        }
    }
}

#[cfg(target_os = "macos")]
fn spawn_render_thread(
    render_context: NonNull<MpvRenderContext>,
    target: VideoSurfaceTarget,
    running: Arc<AtomicBool>,
    update: MpvRenderContextUpdate,
    render: MpvRenderContextRender,
    report_swap: MpvRenderContextReportSwap,
) -> JoinHandle<()> {
    let render_context = render_context.as_ptr() as usize;
    thread::spawn(move || {
        let mut ticks_since_render = RENDER_WATCHDOG_TICKS;
        while running.load(Ordering::SeqCst) {
            make_open_gl_context_current(target.open_gl_context);
            update_open_gl_context(target.open_gl_context);
            let flags = unsafe { update(render_context as *mut MpvRenderContext) };
            if should_render_frame(flags, ticks_since_render) {
                let size = current_size_for_view(
                    target.ns_view,
                    VideoSurfaceSize {
                        width: target.width,
                        height: target.height,
                    },
                );
                set_open_gl_viewport(size.width, size.height);
                let mut fbo = MpvOpenGlFbo {
                    fbo: 0,
                    w: size.width.max(1) as c_int,
                    h: size.height.max(1) as c_int,
                    internal_format: GL_RGBA8,
                };
                let mut flip_y: c_int = 1;
                let mut params = [
                    MpvRenderParam {
                        param_type: MPV_RENDER_PARAM_OPENGL_FBO,
                        data: (&mut fbo as *mut MpvOpenGlFbo).cast(),
                    },
                    MpvRenderParam {
                        param_type: MPV_RENDER_PARAM_FLIP_Y,
                        data: (&mut flip_y as *mut c_int).cast(),
                    },
                    MpvRenderParam {
                        param_type: MPV_RENDER_PARAM_INVALID,
                        data: std::ptr::null_mut(),
                    },
                ];
                let _ =
                    unsafe { render(render_context as *mut MpvRenderContext, params.as_mut_ptr()) };
                flush_open_gl_context(target.open_gl_context);
                unsafe { report_swap(render_context as *mut MpvRenderContext) };
                ticks_since_render = 0;
            } else {
                ticks_since_render = ticks_since_render.saturating_add(1);
            }

            thread::sleep(Duration::from_millis(16));
        }
    })
}

#[cfg(target_os = "macos")]
fn should_render_frame(update_flags: u64, ticks_since_render: u32) -> bool {
    update_flags & MPV_RENDER_UPDATE_FRAME != 0 || ticks_since_render >= RENDER_WATCHDOG_TICKS
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn dlopen(path: *const c_char, mode: c_int) -> *mut c_void;
    fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
}

#[cfg(target_os = "macos")]
const RTLD_LAZY: c_int = 0x1;

#[cfg(target_os = "macos")]
static OPENGL_FRAMEWORK_HANDLE: OnceLock<usize> = OnceLock::new();

#[cfg(target_os = "macos")]
fn make_open_gl_context_current(open_gl_context: usize) {
    if open_gl_context == 0 {
        return;
    }

    unsafe {
        let context = open_gl_context as id;
        let _: () = msg_send![context, makeCurrentContext];
    }
}

#[cfg(target_os = "macos")]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OpenGlContextUpdateAction {
    Skip,
    UpdateDirectly,
    DispatchToMainThread,
}

#[cfg(target_os = "macos")]
fn open_gl_context_update_action(
    open_gl_context: usize,
    is_main_thread: bool,
) -> OpenGlContextUpdateAction {
    if open_gl_context == 0 {
        return OpenGlContextUpdateAction::Skip;
    }

    if is_main_thread {
        OpenGlContextUpdateAction::UpdateDirectly
    } else {
        OpenGlContextUpdateAction::DispatchToMainThread
    }
}

#[cfg(target_os = "macos")]
fn update_open_gl_context(open_gl_context: usize) {
    match open_gl_context_update_action(open_gl_context, is_main_thread()) {
        OpenGlContextUpdateAction::Skip => {}
        OpenGlContextUpdateAction::UpdateDirectly => unsafe {
            let context = open_gl_context as id;
            let _: () = msg_send![context, update];
        },
        OpenGlContextUpdateAction::DispatchToMainThread => unsafe {
            let context = open_gl_context as id;
            let _: () = msg_send![
                context,
                performSelectorOnMainThread: sel!(update)
                withObject: nil
                waitUntilDone: YES
            ];
        },
    }
}

#[cfg(target_os = "macos")]
fn is_main_thread() -> bool {
    unsafe { msg_send![class!(NSThread), isMainThread] }
}

#[cfg(target_os = "macos")]
fn flush_open_gl_context(open_gl_context: usize) {
    if open_gl_context == 0 {
        return;
    }

    unsafe {
        let context = open_gl_context as id;
        let _: () = msg_send![context, flushBuffer];
    }
}

#[cfg(target_os = "macos")]
fn set_open_gl_viewport(width: u32, height: u32) {
    let name = b"glViewport\0";
    let symbol = unsafe { get_open_gl_proc_address(std::ptr::null_mut(), name.as_ptr().cast()) };
    if symbol.is_null() {
        return;
    }

    let gl_viewport: GlViewport = unsafe { std::mem::transmute(symbol) };
    unsafe { gl_viewport(0, 0, width.max(1) as c_int, height.max(1) as c_int) };
}

#[cfg(target_os = "macos")]
fn remove_video_view(ns_view: usize) {
    if ns_view == 0 {
        return;
    }

    unsafe {
        let view = ns_view as id;
        let _: () = msg_send![
            view,
            performSelectorOnMainThread: sel!(removeFromSuperview)
            withObject: nil
            waitUntilDone: YES
        ];
    }
}

#[cfg(target_os = "macos")]
unsafe extern "C" fn get_open_gl_proc_address(
    _ctx: *mut c_void,
    name: *const c_char,
) -> *mut c_void {
    if name.is_null() {
        return std::ptr::null_mut();
    }

    let framework = *OPENGL_FRAMEWORK_HANDLE.get_or_init(|| {
        let path = b"/System/Library/Frameworks/OpenGL.framework/OpenGL\0";
        unsafe { dlopen(path.as_ptr().cast(), RTLD_LAZY) as usize }
    }) as *mut c_void;

    let symbol = if framework.is_null() {
        std::ptr::null_mut()
    } else {
        unsafe { dlsym(framework, name) }
    };
    if symbol.is_null() {
        unsafe { dlsym((-2isize) as *mut c_void, name) }
    } else {
        symbol
    }
}

fn libmpv_symbol_error(error: libloading::Error) -> AppError {
    AppError::new(
        "libmpv_symbol_missing",
        "libmpv 运行时缺少必要符号",
        Some(error.to_string()),
        true,
    )
}

pub enum PlayerBackendMode {
    LibMpv,
    Fake,
}

pub fn create_player_backend(mode: PlayerBackendMode) -> AppResult<Box<dyn PlayerBackend>> {
    match mode {
        PlayerBackendMode::Fake => Ok(Box::<FakePlayerBackend>::default()),
        PlayerBackendMode::LibMpv => create_default_playback_backend(),
    }
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn create_default_playback_backend() -> AppResult<Box<dyn PlayerBackend>> {
    match LibMpvBackend::new() {
        Ok(backend) => Ok(Box::new(backend)),
        Err(error) if error.code == "libmpv_not_available" => {
            Ok(Box::new(UnavailablePlayerBackend::new(error)))
        }
        Err(error) => Err(error),
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn create_default_playback_backend() -> AppResult<Box<dyn PlayerBackend>> {
    Ok(Box::<ExternalMpvBackend>::default())
}

pub fn libmpv_library_candidates() -> Vec<String> {
    let executable = std::env::current_exe().ok();
    libmpv_library_candidates_for_executable(executable.as_deref())
}

pub fn libmpv_library_candidates_for_executable(executable: Option<&Path>) -> Vec<String> {
    let mut candidates = Vec::new();

    if let Some(runtime_dir) = std::env::var_os("VELO_LIBMPV_DIR") {
        push_libmpv_candidates(&mut candidates, Path::new(&runtime_dir));
    }

    if let Some(executable) = executable {
        for runtime_dir in runtime_dirs_for_executable(executable) {
            push_libmpv_candidates(&mut candidates, &runtime_dir);
        }
    }

    candidates.extend(system_libmpv_candidates());
    candidates
}

#[cfg(all(target_os = "macos", not(test)))]
fn runtime_dirs_for_executable(executable: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(contents_dir) = executable
        .parent()
        .filter(|path| path.file_name().is_some_and(|name| name == "MacOS"))
        .and_then(|path| path.parent())
    {
        dirs.push(contents_dir.join("Frameworks"));
    }

    if let Some(src_tauri_dir) = executable
        .ancestors()
        .find(|path| path.file_name().is_some_and(|name| name == "src-tauri"))
    {
        dirs.push(src_tauri_dir.join("runtime").join("macos").join("lib"));
    }

    dirs
}

#[cfg(all(target_os = "windows", not(test)))]
fn runtime_dirs_for_executable(executable: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(executable_dir) = executable.parent() {
        dirs.push(executable_dir.to_path_buf());
        dirs.push(executable_dir.join("bin"));
        dirs.push(executable_dir.join("resources").join("bin"));
    }

    if let Some(src_tauri_dir) = executable
        .ancestors()
        .find(|path| path.file_name().is_some_and(|name| name == "src-tauri"))
    {
        dirs.push(src_tauri_dir.join("runtime").join("windows").join("bin"));
    }

    dirs
}

#[cfg(all(not(test), not(any(target_os = "macos", target_os = "windows"))))]
fn runtime_dirs_for_executable(_executable: &Path) -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(test)]
fn runtime_dirs_for_executable(executable: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(contents_dir) = executable
        .parent()
        .filter(|path| path.file_name().is_some_and(|name| name == "MacOS"))
        .and_then(|path| path.parent())
    {
        dirs.push(contents_dir.join("Frameworks"));
    }

    if let Some(executable_dir) = executable.parent() {
        dirs.push(executable_dir.to_path_buf());
        dirs.push(executable_dir.join("bin"));
        dirs.push(executable_dir.join("resources").join("bin"));
    }

    if let Some(src_tauri_dir) = executable
        .ancestors()
        .find(|path| path.file_name().is_some_and(|name| name == "src-tauri"))
    {
        dirs.push(src_tauri_dir.join("runtime").join("macos").join("lib"));
        dirs.push(src_tauri_dir.join("runtime").join("windows").join("bin"));
    }

    dirs
}

#[cfg(all(target_os = "macos", not(test)))]
fn push_libmpv_candidates(candidates: &mut Vec<String>, dir: &Path) {
    candidates.push(dir.join("libmpv.2.dylib").to_string_lossy().into_owned());
    candidates.push(dir.join("libmpv.dylib").to_string_lossy().into_owned());
}

#[cfg(all(target_os = "windows", not(test)))]
fn push_libmpv_candidates(candidates: &mut Vec<String>, dir: &Path) {
    candidates.push(dir.join("mpv-2.dll").to_string_lossy().into_owned());
    candidates.push(dir.join("libmpv-2.dll").to_string_lossy().into_owned());
    candidates.push(dir.join("libmpv.dll").to_string_lossy().into_owned());
}

#[cfg(all(not(test), not(any(target_os = "macos", target_os = "windows"))))]
fn push_libmpv_candidates(_candidates: &mut Vec<String>, _dir: &Path) {}

#[cfg(test)]
fn push_libmpv_candidates(candidates: &mut Vec<String>, dir: &Path) {
    candidates.push(dir.join("libmpv.2.dylib").to_string_lossy().into_owned());
    candidates.push(dir.join("libmpv.dylib").to_string_lossy().into_owned());
    candidates.push(dir.join("mpv-2.dll").to_string_lossy().into_owned());
    candidates.push(dir.join("libmpv-2.dll").to_string_lossy().into_owned());
    candidates.push(dir.join("libmpv.dll").to_string_lossy().into_owned());
}

pub fn mpv_error(operation: &str, code: c_int) -> AppError {
    AppError::new(
        "libmpv_command_failed",
        "libmpv 播放命令执行失败",
        Some(format!("{operation} returned {code}")),
        true,
    )
}

#[cfg(all(target_os = "macos", not(test)))]
fn system_libmpv_candidates() -> Vec<String> {
    [
        "/opt/homebrew/lib/libmpv.2.dylib",
        "/opt/homebrew/lib/libmpv.dylib",
        "/usr/local/lib/libmpv.2.dylib",
        "/usr/local/lib/libmpv.dylib",
    ]
    .iter()
    .map(|path| PathBuf::from(path).to_string_lossy().into_owned())
    .collect()
}

#[cfg(all(target_os = "windows", not(test)))]
fn system_libmpv_candidates() -> Vec<String> {
    vec![
        "mpv-2.dll".into(),
        "libmpv-2.dll".into(),
        "libmpv.dll".into(),
    ]
}

#[cfg(all(not(test), not(any(target_os = "macos", target_os = "windows"))))]
fn system_libmpv_candidates() -> Vec<String> {
    Vec::new()
}

#[cfg(test)]
fn system_libmpv_candidates() -> Vec<String> {
    vec![
        "/opt/homebrew/lib/libmpv.2.dylib".into(),
        "/opt/homebrew/lib/libmpv.dylib".into(),
        "/usr/local/lib/libmpv.2.dylib".into(),
        "/usr/local/lib/libmpv.dylib".into(),
        "mpv-2.dll".into(),
        "libmpv-2.dll".into(),
        "libmpv.dll".into(),
    ]
}

#[cfg(target_os = "macos")]
fn default_video_output() -> &'static str {
    "libmpv"
}

#[cfg(target_os = "windows")]
fn default_video_output() -> &'static str {
    "gpu-next,gpu,direct3d"
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn default_video_output() -> &'static str {
    "libmpv"
}

fn hwdec_option(hwdec: &HardwareDecoder) -> &'static str {
    match hwdec {
        HardwareDecoder::VideoToolbox => videotoolbox_hwdec_option(),
        HardwareDecoder::AutoSafe => "auto-safe",
        HardwareDecoder::Disabled => "no",
    }
}

#[cfg(target_os = "macos")]
fn videotoolbox_hwdec_option() -> &'static str {
    "videotoolbox"
}

#[cfg(not(target_os = "macos"))]
fn videotoolbox_hwdec_option() -> &'static str {
    "auto-safe"
}

fn configure_disk_cache(
    mpv_set_option_string: MpvSetOptionString,
    handle: NonNull<MpvHandle>,
) -> AppResult<()> {
    let cache_dir = playback_cache_dir();
    std::fs::create_dir_all(&cache_dir).map_err(|error| {
        AppError::new(
            "playback_cache_error",
            "本地视频缓存目录创建失败",
            Some(error.to_string()),
            true,
        )
    })?;

    for (name, value) in libmpv_disk_cache_options_for_dir(&cache_dir) {
        set_option_string(mpv_set_option_string, handle, &name, &value)?;
    }
    Ok(())
}

pub fn libmpv_disk_cache_options_for_dir(dir: &Path) -> Vec<(String, String)> {
    vec![
        ("cache".into(), "yes".into()),
        ("cache-on-disk".into(), "yes".into()),
        ("cache-secs".into(), STARTUP_CACHE_SECONDS.to_string()),
        (
            "demuxer-cache-dir".into(),
            dir.to_string_lossy().into_owned(),
        ),
        ("demuxer-cache-unlink-files".into(), "no".into()),
        ("demuxer-seekable-cache".into(), "yes".into()),
        (
            "demuxer-readahead-secs".into(),
            STARTUP_CACHE_SECONDS.to_string(),
        ),
    ]
}

fn apply_buffer_profile(
    handle: NonNull<MpvHandle>,
    mpv_set_property: MpvSetProperty,
    profile: PlaybackBufferProfile,
) -> AppResult<()> {
    let seconds = match profile {
        PlaybackBufferProfile::Startup => STARTUP_CACHE_SECONDS,
        PlaybackBufferProfile::Steady => STEADY_CACHE_SECONDS,
    };
    set_property_u32(mpv_set_property, handle, "cache-secs", seconds)?;
    set_property_u32(mpv_set_property, handle, "demuxer-readahead-secs", seconds)?;
    Ok(())
}

fn set_option_string(
    mpv_set_option_string: MpvSetOptionString,
    handle: NonNull<MpvHandle>,
    name: &str,
    value: &str,
) -> AppResult<()> {
    let name = CString::new(name).map_err(|error| {
        AppError::new(
            "libmpv_option_invalid",
            "libmpv 选项名称无效",
            Some(error.to_string()),
            true,
        )
    })?;
    let value = CString::new(value).map_err(|error| {
        AppError::new(
            "libmpv_option_invalid",
            "libmpv 选项值无效",
            Some(error.to_string()),
            true,
        )
    })?;
    let code = unsafe { mpv_set_option_string(handle.as_ptr(), name.as_ptr(), value.as_ptr()) };
    if code < 0 {
        return Err(mpv_error("mpv_set_option_string", code));
    }
    Ok(())
}

fn set_property(
    mpv_set_property: MpvSetProperty,
    handle: NonNull<MpvHandle>,
    name: &str,
    format: c_int,
    value: *mut c_void,
) -> AppResult<()> {
    let name = CString::new(name).map_err(|error| {
        AppError::new(
            "libmpv_property_invalid",
            "libmpv 属性名称无效",
            Some(error.to_string()),
            true,
        )
    })?;
    let code = unsafe { mpv_set_property(handle.as_ptr(), name.as_ptr(), format, value) };
    if code < 0 {
        return Err(mpv_error("mpv_set_property", code));
    }
    Ok(())
}

fn set_property_u32(
    mpv_set_property: MpvSetProperty,
    handle: NonNull<MpvHandle>,
    name: &str,
    value: u32,
) -> AppResult<()> {
    let mut value = f64::from(value);
    set_property(
        mpv_set_property,
        handle,
        name,
        MPV_FORMAT_DOUBLE,
        (&mut value as *mut c_double).cast(),
    )
}

fn get_property(
    mpv_get_property: MpvGetProperty,
    handle: NonNull<MpvHandle>,
    name: &str,
    format: c_int,
    value: *mut c_void,
) -> AppResult<()> {
    let name = CString::new(name).map_err(|error| {
        AppError::new(
            "libmpv_property_invalid",
            "libmpv 属性名称无效",
            Some(error.to_string()),
            true,
        )
    })?;
    let code = unsafe { mpv_get_property(handle.as_ptr(), name.as_ptr(), format, value) };
    if code < 0 {
        return Err(AppError::new(
            "libmpv_property_unavailable",
            "libmpv 播放状态暂不可用",
            Some(format!("mpv_get_property returned {code}")),
            true,
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "macos")]
    use std::ffi::CStr;
    use std::path::PathBuf;

    use crate::player::backend::PlayerBackend;

    use super::{
        create_player_backend, libmpv_disk_cache_options_for_dir,
        libmpv_library_candidates_for_executable, mpv_error, LibMpvBackend, PlayerBackendMode,
        STARTUP_CACHE_SECONDS, STEADY_CACHE_SECONDS,
    };

    fn normalize_candidate_paths(candidates: Vec<String>) -> Vec<String> {
        candidates
            .into_iter()
            .map(|path| path.replace('\\', "/"))
            .collect()
    }

    #[test]
    fn player_backend_factory_can_create_fake_backend_for_tests() {
        let backend = create_player_backend(PlayerBackendMode::Fake).unwrap();

        assert_eq!(backend.snapshot().speed, 1.0);
    }

    #[test]
    fn libmpv_library_candidates_prefer_bundled_runtime() {
        let candidates = normalize_candidate_paths(libmpv_library_candidates_for_executable(Some(
            &PathBuf::from("/Applications/Velo.app/Contents/MacOS/Velo"),
        )));

        assert!(
            candidates
                .iter()
                .any(|path| path.contains("Frameworks/libmpv")),
            "{candidates:?}"
        );
        assert!(
            candidates
                .first()
                .is_some_and(|path| path.contains("Frameworks/libmpv")),
            "{candidates:?}"
        );
    }

    #[test]
    fn libmpv_library_candidates_use_macos_contents_frameworks() {
        let candidates = normalize_candidate_paths(libmpv_library_candidates_for_executable(Some(
            &PathBuf::from("/Applications/Velo.app/Contents/MacOS/Velo"),
        )));

        assert!(
            candidates
                .contains(&"/Applications/Velo.app/Contents/Frameworks/libmpv.2.dylib".into(),),
            "{candidates:?}"
        );
        assert!(!candidates
            .iter()
            .any(|path| path.contains(".app/Frameworks/libmpv")));
    }

    #[test]
    fn libmpv_library_candidates_include_repo_runtime_for_dev() {
        let candidates = normalize_candidate_paths(libmpv_library_candidates_for_executable(Some(
            &PathBuf::from("/workspace/velo/src-tauri/target/debug/velo"),
        )));

        assert!(
            candidates
                .contains(&"/workspace/velo/src-tauri/runtime/macos/lib/libmpv.2.dylib".into(),),
            "{candidates:?}"
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_default_backend_uses_embedded_surface_even_without_runtime() {
        let backend = create_player_backend(PlayerBackendMode::LibMpv).unwrap();

        assert!(backend.requires_video_surface());
    }

    #[test]
    fn libmpv_library_candidates_include_windows_packaged_runtime() {
        let candidates = normalize_candidate_paths(libmpv_library_candidates_for_executable(Some(
            &PathBuf::from("C:/Program Files/Velo/Velo.exe"),
        )));
        let mpv_dll = PathBuf::from("C:/Program Files/Velo/resources/bin/mpv-2.dll")
            .to_string_lossy()
            .replace('\\', "/");
        let libmpv_dll = PathBuf::from("C:/Program Files/Velo/resources/bin/libmpv-2.dll")
            .to_string_lossy()
            .replace('\\', "/");

        assert!(candidates.contains(&mpv_dll), "{candidates:?}");
        assert!(candidates.contains(&libmpv_dll), "{candidates:?}");
    }

    #[test]
    fn libmpv_library_candidates_include_windows_repo_runtime_for_dev() {
        let candidates = normalize_candidate_paths(libmpv_library_candidates_for_executable(Some(
            &PathBuf::from("C:/workspace/velo/src-tauri/target/debug/velo.exe"),
        )));
        let runtime_dll =
            PathBuf::from("C:/workspace/velo/src-tauri/runtime/windows/bin/mpv-2.dll")
                .to_string_lossy()
                .replace('\\', "/");

        assert!(candidates.contains(&runtime_dll), "{candidates:?}");
    }

    #[test]
    fn maps_negative_mpv_error_to_app_error() {
        let error = mpv_error("mpv_initialize", -12);

        assert_eq!(error.code, "libmpv_command_failed");
        assert!(error.message.contains("libmpv"));
    }

    #[test]
    fn mpv_format_double_matches_client_api_value() {
        assert_eq!(super::MPV_FORMAT_DOUBLE, 5);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn render_loop_draws_periodically_even_without_update_flag() {
        assert!(super::should_render_frame(0, super::RENDER_WATCHDOG_TICKS));
        assert!(!super::should_render_frame(
            0,
            super::RENDER_WATCHDOG_TICKS - 1
        ));
        assert!(super::should_render_frame(
            super::MPV_RENDER_UPDATE_FRAME,
            0
        ));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn open_gl_context_update_is_dispatched_to_main_thread_from_render_thread() {
        assert_eq!(
            super::open_gl_context_update_action(0x20, false),
            super::OpenGlContextUpdateAction::DispatchToMainThread
        );
        assert_eq!(
            super::open_gl_context_update_action(0x20, true),
            super::OpenGlContextUpdateAction::UpdateDirectly
        );
        assert_eq!(
            super::open_gl_context_update_action(0, false),
            super::OpenGlContextUpdateAction::Skip
        );
    }

    #[test]
    fn libmpv_disk_cache_options_limit_readahead_to_15_seconds() {
        let options = libmpv_disk_cache_options_for_dir(&PathBuf::from("/tmp/emby-cache"));

        assert!(options.contains(&("cache".into(), "yes".into())));
        assert!(options.contains(&("cache-on-disk".into(), "yes".into())));
        assert!(options.contains(&("cache-secs".into(), STARTUP_CACHE_SECONDS.to_string())));
        assert!(options.contains(&("demuxer-cache-dir".into(), "/tmp/emby-cache".into())));
        assert!(options.contains(&("demuxer-cache-unlink-files".into(), "no".into())));
        assert!(options.contains(&("demuxer-seekable-cache".into(), "yes".into())));
        assert!(options.contains(&(
            "demuxer-readahead-secs".into(),
            STARTUP_CACHE_SECONDS.to_string()
        )));
    }

    #[test]
    fn buffer_profile_seconds_match_startup_and_steady_targets() {
        let startup = match crate::player::backend::PlaybackBufferProfile::Startup {
            crate::player::backend::PlaybackBufferProfile::Startup => STARTUP_CACHE_SECONDS,
            crate::player::backend::PlaybackBufferProfile::Steady => 0,
        };
        let steady = match crate::player::backend::PlaybackBufferProfile::Steady {
            crate::player::backend::PlaybackBufferProfile::Startup => 0,
            crate::player::backend::PlaybackBufferProfile::Steady => STEADY_CACHE_SECONDS,
        };

        assert_eq!(startup, 15);
        assert_eq!(steady, 30);
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn videotoolbox_hwdec_uses_safe_windows_fallback() {
        assert_eq!(
            super::hwdec_option(&crate::player::backend::HardwareDecoder::VideoToolbox),
            "auto-safe"
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn open_gl_api_type_param_passes_api_name_as_char_pointer() {
        let param = super::open_gl_api_type_param();

        assert_eq!(param.param_type, super::MPV_RENDER_PARAM_API_TYPE);
        let api_name = unsafe { CStr::from_ptr(param.data.cast_const().cast()) };
        assert_eq!(
            api_name.to_bytes_with_nul(),
            super::MPV_RENDER_API_TYPE_OPENGL
        );
    }

    #[test]
    fn libmpv_backend_loads_prepared_runtime_when_available() {
        if !PathBuf::from("runtime/macos/lib/libmpv.2.dylib").exists() {
            return;
        }

        let backend = LibMpvBackend::new().unwrap();

        assert_eq!(backend.snapshot().speed, 1.0);
    }
}
