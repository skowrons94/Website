/* Single-threaded stand-in for OpenMP: WebAssembly side modules run in one thread. */
#ifndef AZURE2_WASM_OMP_STUB_H
#define AZURE2_WASM_OMP_STUB_H
#ifdef __cplusplus
extern "C" {
#endif
typedef int omp_lock_t;
static inline int omp_get_thread_num(void) { return 0; }
static inline int omp_get_num_threads(void) { return 1; }
static inline int omp_get_max_threads(void) { return 1; }
static inline int omp_get_num_procs(void) { return 1; }
static inline void omp_set_num_threads(int n) { (void)n; }
static inline int omp_in_parallel(void) { return 0; }
static inline double omp_get_wtime(void) { return 0.0; }
static inline void omp_init_lock(omp_lock_t *l) { (void)l; }
static inline void omp_destroy_lock(omp_lock_t *l) { (void)l; }
static inline void omp_set_lock(omp_lock_t *l) { (void)l; }
static inline void omp_unset_lock(omp_lock_t *l) { (void)l; }
static inline void omp_set_dynamic(int n) { (void)n; }
static inline void omp_set_nested(int n) { (void)n; }
static inline void omp_set_max_active_levels(int n) { (void)n; }
static inline int omp_get_level(void) { return 0; }
static inline int omp_get_thread_limit(void) { return 1; }
#ifdef __cplusplus
}
#endif
#endif
