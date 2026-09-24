use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicUsize, Ordering};

pub struct TrackAlloc;

pub static CURRENT: AtomicUsize = AtomicUsize::new(0);
pub static PEAK: AtomicUsize = AtomicUsize::new(0);

fn header(layout: Layout) -> (Layout, usize) {
    let (full, offset) = Layout::new::<usize>().extend(layout).expect("layout");
    let full = full.pad_to_align();
    (full, offset)
}

fn note_alloc(size: usize) {
    let current = CURRENT.fetch_add(size, Ordering::Relaxed) + size;
    let mut peak = PEAK.load(Ordering::Relaxed);
    while current > peak {
        match PEAK.compare_exchange_weak(peak, current, Ordering::Relaxed, Ordering::Relaxed) {
            Ok(_) => break,
            Err(observed) => peak = observed,
        }
    }
}

unsafe impl GlobalAlloc for TrackAlloc {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        let (full, offset) = header(layout);
        let base = unsafe { System.alloc(full) };
        if base.is_null() {
            return base;
        }
        unsafe { base.cast::<usize>().write(full.size()) };
        note_alloc(full.size());
        unsafe { base.add(offset) }
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        let (full, offset) = header(layout);
        let base = unsafe { ptr.sub(offset) };
        let size = unsafe { base.cast::<usize>().read() };
        CURRENT.fetch_sub(size, Ordering::Relaxed);
        unsafe { System.dealloc(base, full) };
    }
}

pub fn mark_baseline() {
    let current = CURRENT.load(Ordering::Relaxed);
    PEAK.store(current, Ordering::Relaxed);
}
