const DEFAULT_MAX_WINDOW_PERCENT: u8 = 75;
const DEFAULT_PLAYBACK_ASPECT_RATIO: f64 = 16.0 / 9.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlaybackWindowSize {
    pub width: u32,
    pub height: u32,
}

pub fn mpv_autofit_larger_value() -> String {
    format!("{DEFAULT_MAX_WINDOW_PERCENT}%x{DEFAULT_MAX_WINDOW_PERCENT}%")
}

pub fn mpv_autofit_larger_arg() -> String {
    format!("--autofit-larger={}", mpv_autofit_larger_value())
}

pub fn fitted_playback_window_size(
    available_width: u32,
    available_height: u32,
) -> PlaybackWindowSize {
    fitted_playback_window_size_with_aspect(
        available_width,
        available_height,
        DEFAULT_PLAYBACK_ASPECT_RATIO,
    )
}

fn fitted_playback_window_size_with_aspect(
    available_width: u32,
    available_height: u32,
    aspect_ratio: f64,
) -> PlaybackWindowSize {
    let max_width = scaled_dimension(available_width, DEFAULT_MAX_WINDOW_PERCENT);
    let max_height = scaled_dimension(available_height, DEFAULT_MAX_WINDOW_PERCENT);
    let width_from_height = (f64::from(max_height) * aspect_ratio).round() as u32;

    if width_from_height <= max_width {
        return PlaybackWindowSize {
            width: width_from_height,
            height: max_height,
        };
    }

    PlaybackWindowSize {
        width: max_width,
        height: (f64::from(max_width) / aspect_ratio).round() as u32,
    }
}

fn scaled_dimension(value: u32, percent: u8) -> u32 {
    ((u64::from(value.max(1)) * u64::from(percent)) / 100).max(1) as u32
}

#[cfg(test)]
mod tests {
    use super::{
        fitted_playback_window_size, mpv_autofit_larger_arg, mpv_autofit_larger_value,
        PlaybackWindowSize,
    };

    #[test]
    fn limits_initial_player_window_to_current_screen() {
        assert_eq!(mpv_autofit_larger_value(), "75%x75%");
        assert_eq!(mpv_autofit_larger_arg(), "--autofit-larger=75%x75%");
    }

    #[test]
    fn fits_playback_window_to_current_screen_with_16_by_9_ratio() {
        assert_eq!(
            fitted_playback_window_size(1920, 1080),
            PlaybackWindowSize {
                width: 1440,
                height: 810,
            }
        );
        assert_eq!(
            fitted_playback_window_size(1280, 1024),
            PlaybackWindowSize {
                width: 960,
                height: 540,
            }
        );
    }
}
