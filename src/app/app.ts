import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  input,
  effect,
  signal,
  inject
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-chart',
  standalone: true,
  template: `<canvas #chartCanvas></canvas>`,
  styles: [`:host { display: block; width: 100%; height: 100%; }`],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  
  chartData = input.required<{
    chartType: 'bar' | 'line' | 'pie';
    data: { label: string; baseline: number; optimized: number }[];
  }>();

  private chartInstance: Chart | null = null;

  constructor() {
    effect(() => {
      const data = this.chartData();
      if (this.chartInstance) {
        this.updateChart(data);
      }
    });
  }

  ngAfterViewInit() {
    this.createChart(this.chartData());
  }

  ngOnDestroy() {
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }
  }

  private createChart(data: any) {
    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (!ctx) return;

    this.chartInstance = new Chart(ctx, {
      type: data.chartType === 'pie' ? 'pie' : data.chartType,
      data: this.getChartData(data),
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: { color: '#000000' } // Black
          }
        },
        scales: data.chartType !== 'pie' ? {
          x: {
            grid: { color: '#0000001a' }, // Black/10
            ticks: { color: '#000000' } // Black
          },
          y: {
            grid: { color: '#0000001a' },
            ticks: { color: '#000000' }
          }
        } : undefined
      }
    });
  }

  private updateChart(data: any) {
    if (!this.canvasRef) return;
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }
    this.createChart(data);
  }

  private getChartData(data: any) {
    const labels = data.data.map((d: any) => d.label);
    
    if (data.chartType === 'pie') {
      return {
        labels,
        datasets: [{
          data: data.data.map((d: any) => d.optimized),
          backgroundColor: ['#16a34a', '#000000', '#ffffff', '#22c55e', '#bbf7d0'], // Greens, Black, White
          borderColor: '#000000',
          borderWidth: 2
        }]
      };
    }

    return {
      labels,
      datasets: [
        {
          label: 'Baseline',
          data: data.data.map((d: any) => d.baseline),
          backgroundColor: '#000000', // Black
          borderColor: '#000000',
          borderWidth: 1
        },
        {
          label: 'Optimized',
          data: data.data.map((d: any) => d.optimized),
          backgroundColor: '#16a34a', // Green-600
          borderColor: '#16a34a',
          borderWidth: 1
        }
      ]
    };
  }
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  standalone: true,
  imports: [ReactiveFormsModule, MatIconModule, ChartComponent],
  templateUrl: './app.html',
})
export class App {
  private http = inject(HttpClient);
  
  goalControl = new FormControl('', { validators: [Validators.required] });
  selectedFile = signal<File | null>(null);
  
  status = signal<'idle' | 'analyzing' | 'success' | 'error'>('idle');
  errorMessage = signal<string | null>(null);
  result = signal<any | null>(null);

  isDragging = signal(false);

  loadingSteps = [
    { text: 'Parsing document schema...', duration: 1500 },
    { text: 'Aligning with target goals...', duration: 2500 },
    { text: 'Extracting key strategic insights...', duration: 4000 },
    { text: 'Synthesizing visual matrix...', duration: 5500 }
  ];
  currentLoadingStep = signal(this.loadingSteps[0].text);

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
    if (event.dataTransfer?.files.length) {
      this.selectedFile.set(event.dataTransfer.files[0]);
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.selectedFile.set(input.files[0]);
    }
  }

  clearSelection() {
    this.selectedFile.set(null);
    this.goalControl.reset();
  }

  resetAll() {
    this.status.set('idle');
    this.result.set(null);
    this.selectedFile.set(null);
    this.goalControl.reset();
    this.errorMessage.set(null);
  }

  submitAnalysis() {
    const file = this.selectedFile();
    const goal = this.goalControl.value;

    if (!file || !goal) return;

    this.status.set('analyzing');
    this.errorMessage.set(null);
    
    // Simulate complex AI analysis steps for realism
    let nextWait = 0;
    this.loadingSteps.forEach(step => {
       setTimeout(() => {
         if (this.status() === 'analyzing') {
           this.currentLoadingStep.set(step.text);
         }
       }, step.duration);
    });

    const formData = new FormData();
    formData.append('data_file', file);
    formData.append('targetGoal', goal);

    this.http.post('/api/analyze', formData).subscribe({
      next: (res) => {
        this.status.set('success');
        this.result.set(res);
      },
      error: (err) => {
        console.error(err);
        this.status.set('error');
        this.errorMessage.set(err.error?.error || 'An unexpected error occurred during analysis.');
      }
    });
  }
}
