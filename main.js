// Global variables
let rawData = [];
let filteredData = [];
let timeSeriesData = [];
let currentMetric = 'price';
let currentFilters = {
    bedrooms: 'all',
    waterfront: 'all',
    condition: 'all',
    sqftMin: null,
    sqftMax: null
};
let currentBrushExtent = null;

// Chart references
let mainSvg, scatterSvg, distSvg, timelineSvg;
let xScale, yScale, colorScale;
let brush;

// Dimensions
const margin = { top: 50, right: 150, bottom: 60, left: 80 };
const scatterMargin = { top: 40, right: 40, bottom: 60, left: 80 };
const distMargin = { top: 40, right: 40, bottom: 60, left: 80 };
const timelineMargin = { top: 10, right: 150, bottom: 40, left: 80 };

// Load and process data
async function loadData() {
    try {
        const data = await d3.csv('usahouseprice.csv');

        // Parse and clean data
        rawData = data.map(d => ({
            date: new Date(d.date),
            price: +d.price,
            bedrooms: +d.bedrooms,
            bathrooms: +d.bathrooms,
            sqft_living: +d.sqft_living,
            sqft_lot: +d.sqft_lot,
            floors: +d.floors,
            waterfront: +d.waterfront,
            view: +d.view,
            condition: +d.condition,
            sqft_above: +d.sqft_above,
            sqft_basement: +d.sqft_basement,
            yr_built: +d.yr_built,
            yr_renovated: +d.yr_renovated,
            city: d.city,
            statezip: d.statezip,
            price_per_sqft: +d.price / +d.sqft_living
        })).filter(d => !isNaN(d.price) && !isNaN(d.date.getTime()) && d.sqft_living > 0);

        // Sort by date
        rawData.sort((a, b) => a.date - b.date);

        // Hide loading, show content
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');

        // Initialize
        applyFilters();
        initVisualization();
        setupControls();

    } catch (error) {
        console.error('Error loading data:', error);
        document.getElementById('loading').innerHTML =
            '<p style="color: #e53e3e;">Error: Could not load usahouseprice.csv. Please ensure the file exists in the same directory.</p>';
    }
}

// Apply filters to data
function applyFilters() {
    filteredData = rawData.filter(d => {
        // Bedroom filter
        if (currentFilters.bedrooms !== 'all') {
            if (currentFilters.bedrooms === '5+' && d.bedrooms < 5) return false;
            if (currentFilters.bedrooms !== '5+' && d.bedrooms !== +currentFilters.bedrooms) return false;
        }

        // Waterfront filter
        if (currentFilters.waterfront !== 'all' && d.waterfront !== +currentFilters.waterfront) {
            return false;
        }

        // Condition filter
        if (currentFilters.condition !== 'all' && d.condition !== +currentFilters.condition) {
            return false;
        }

        // Square footage filters
        if (currentFilters.sqftMin && d.sqft_living < currentFilters.sqftMin) return false;
        if (currentFilters.sqftMax && d.sqft_living > currentFilters.sqftMax) return false;

        return true;
    });

    // Aggregate time series data by month
    const monthlyData = d3.rollup(
        filteredData,
        v => ({
            avgPrice: d3.mean(v, d => d.price),
            avgPriceSqft: d3.mean(v, d => d.price_per_sqft),
            count: v.length,
            medianPrice: d3.median(v, d => d.price)
        }),
        d => d3.timeMonth(d.date)
    );

    timeSeriesData = Array.from(monthlyData, ([date, metrics]) => ({
        date,
        ...metrics
    })).sort((a, b) => a.date - b.date);

    updateActiveBadges();
}

// Initialize all visualizations
function initVisualization() {
    createMainChart();
    createScatterPlot();
    createDistributionChart();
    createTimeline();
}

// Create main time series chart
function createMainChart() {
    const container = d3.select('#main-chart');
    const bounds = container.node().getBoundingClientRect();
    const width = bounds.width - margin.left - margin.right;
    const height = bounds.height - margin.top - margin.bottom;

    container.selectAll('*').remove();

    mainSvg = container.append('svg')
        .attr('width', bounds.width)
        .attr('height', bounds.height)
        .append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add grid
    const grid = mainSvg.append('g').attr('class', 'grid');

    // Scales
    const dateExtent = currentBrushExtent || d3.extent(timeSeriesData, d => d.date);
    xScale = d3.scaleTime()
        .domain(dateExtent)
        .range([0, width]);

    const metricKey = currentMetric === 'price' ? 'avgPrice' :
        currentMetric === 'price_sqft' ? 'avgPriceSqft' : 'count';

    yScale = d3.scaleLinear()
        .domain([0, d3.max(timeSeriesData, d => d[metricKey])])
        .range([height, 0])
        .nice();

    // Y-axis grid
    grid.selectAll('.grid-line-y')
        .data(yScale.ticks(8))
        .join('line')
        .attr('class', 'grid-line-y')
        .attr('x1', 0)
        .attr('x2', width)
        .attr('y1', d => yScale(d))
        .attr('y2', d => yScale(d))
        .attr('stroke', '#e2e8f0')
        .attr('stroke-dasharray', '4 4')
        .attr('opacity', 0.7);

    // Area generator
    const area = d3.area()
        .x(d => xScale(d.date))
        .y0(height)
        .y1(d => yScale(d[metricKey]))
        .curve(d3.curveMonotoneX);

    // Line generator
    const line = d3.line()
        .x(d => xScale(d.date))
        .y(d => yScale(d[metricKey]))
        .curve(d3.curveMonotoneX);

    // Draw area
    mainSvg.append('path')
        .datum(timeSeriesData)
        .attr('class', 'area')
        .attr('d', area)
        .attr('fill', 'url(#gradient)')
        .attr('opacity', 0.6);

    // Gradient definition
    const defs = mainSvg.append('defs');
    const gradient = defs.append('linearGradient')
        .attr('id', 'gradient')
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '0%')
        .attr('y2', '100%');

    gradient.append('stop')
        .attr('offset', '0%')
        .attr('stop-color', '#667eea')
        .attr('stop-opacity', 0.8);

    gradient.append('stop')
        .attr('offset', '100%')
        .attr('stop-color', '#764ba2')
        .attr('stop-opacity', 0.2);

    // Draw line
    mainSvg.append('path')
        .datum(timeSeriesData)
        .attr('class', 'line')
        .attr('d', line)
        .attr('stroke', '#667eea')
        .attr('stroke-width', 3)
        .attr('fill', 'none');

    // Add dots for hover
    mainSvg.selectAll('.dot')
        .data(timeSeriesData)
        .join('circle')
        .attr('class', 'dot')
        .attr('cx', d => xScale(d.date))
        .attr('cy', d => yScale(d[metricKey]))
        .attr('r', 4)
        .attr('fill', '#764ba2')
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('r', 8);
            showMainTooltip(event, d);
        })
        .on('mouseout', function() {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('r', 4);
            hideTooltip();
        });

    // Axes
    const xAxis = d3.axisBottom(xScale).ticks(10);
    const yAxis = d3.axisLeft(yScale).ticks(8).tickFormat(d => {
        if (currentMetric === 'count') return d.toLocaleString();
        return '';
    });

    mainSvg.append('g')
        .attr('class', 'x-axis axis')
        .attr('transform', `translate(0,${height})`)
        .call(xAxis);

    mainSvg.append('g')
        .attr('class', 'y-axis axis')
        .call(yAxis);

    // Axis labels
    mainSvg.append('text')
        .attr('class', 'axis-label')
        .attr('x', width / 2)
        .attr('y', height + 45)
        .attr('text-anchor', 'middle')
        .text('Date');

    const yLabel = currentMetric === 'price' ? 'Average Price (USD)' :
        currentMetric === 'price_sqft' ? 'Price per Sq Ft (USD)' :
            'Number of Sales';

    mainSvg.append('text')
        .attr('class', 'axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -55)
        .attr('text-anchor', 'middle')
        .text(yLabel);

    // Title
    mainSvg.append('text')
        .attr('x', width / 2)
        .attr('y', -20)
        .attr('text-anchor', 'middle')
        .style('font-size', '18px')
        .style('font-weight', '700')
        .attr('class', 'text-gradient')
        .text('House Price Trends Over Time');
}

// Create scatter plot (Price vs Sqft Living)
function createScatterPlot() {
    const container = d3.select('#scatter-plot');
    const bounds = container.node().getBoundingClientRect();
    const width = bounds.width - scatterMargin.left - scatterMargin.right;
    const height = bounds.height - scatterMargin.top - scatterMargin.bottom;

    container.selectAll('*').remove();

    scatterSvg = container.append('svg')
        .attr('width', bounds.width)
        .attr('height', bounds.height)
        .append('g')
        .attr('transform', `translate(${scatterMargin.left},${scatterMargin.top})`);

    // Sample data for performance (max 1000 points)
    const sampleData = filteredData.length > 1000
        ? filteredData.filter((d, i) => i % Math.ceil(filteredData.length / 1000) === 0)
        : filteredData;

    // Scales
    const xScaleScatter = d3.scaleLinear()
        .domain([0, d3.max(sampleData, d => d.sqft_living)])
        .range([0, width])
        .nice();

    const yScaleScatter = d3.scaleLinear()
        .domain([0, d3.max(sampleData, d => d.price)])
        .range([height, 0])
        .nice();

    const colorScaleScatter = d3.scaleOrdinal()
        .domain([1, 2, 3, 4, 5])
        .range(['#ef4444', '#f59e0b', '#eab308', '#84cc16', '#22c55e']);

    // Draw points
    scatterSvg.selectAll('.scatter-dot')
        .data(sampleData)
        .join('circle')
        .attr('class', 'scatter-dot')
        .attr('cx', d => xScaleScatter(d.sqft_living))
        .attr('cy', d => yScaleScatter(d.price))
        .attr('r', 4)
        .attr('fill', d => colorScaleScatter(d.condition))
        .attr('opacity', 0.6)
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('r', 8)
                .attr('opacity', 1);
            showScatterTooltip(event, d);
        })
        .on('mouseout', function() {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('r', 4)
                .attr('opacity', 0.6);
            hideTooltip();
        });

    // Axes
    scatterSvg.append('g')
        .attr('class', 'x-axis axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScaleScatter).ticks(8));

    scatterSvg.append('g')
        .attr('class', 'y-axis axis')
        .call(d3.axisLeft(yScaleScatter).ticks(8).tickFormat(d => ''));

    // Labels
    scatterSvg.append('text')
        .attr('class', 'axis-label')
        .attr('x', width / 2)
        .attr('y', height + 45)
        .attr('text-anchor', 'middle')
        .text('Living Area (Sq Ft)');

    scatterSvg.append('text')
        .attr('class', 'axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -55)
        .attr('text-anchor', 'middle')
        .text('Price (USD)');

    // Title
    scatterSvg.append('text')
        .attr('x', width / 2)
        .attr('y', -15)
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .style('font-weight', '600')
        .style('fill', '#1e293b')
        .text('Price vs Living Area');

    // Legend
    const legend = scatterSvg.append('g')
        .attr('transform', `translate(${width - 100}, 10)`);

    legend.append('text')
        .attr('x', 0)
        .attr('y', 0)
        .style('font-size', '12px')
        .style('font-weight', '600')
        .text('Condition:');

    [5, 4, 3, 2, 1].forEach((condition, i) => {
        const legendRow = legend.append('g')
            .attr('transform', `translate(0, ${i * 18 + 15})`);

        legendRow.append('circle')
            .attr('cx', 6)
            .attr('cy', 0)
            .attr('r', 5)
            .attr('fill', colorScaleScatter(condition));

        legendRow.append('text')
            .attr('x', 15)
            .attr('y', 4)
            .style('font-size', '11px')
            .text(condition);
    });
}

// Create distribution chart (Price histogram)
function createDistributionChart() {
    const container = d3.select('#distribution-chart');
    const bounds = container.node().getBoundingClientRect();
    const width = bounds.width - distMargin.left - distMargin.right;
    const height = bounds.height - distMargin.top - distMargin.bottom;

    container.selectAll('*').remove();

    distSvg = container.append('svg')
        .attr('width', bounds.width)
        .attr('height', bounds.height)
        .append('g')
        .attr('transform', `translate(${distMargin.left},${distMargin.top})`);

    // Create histogram
    const histogram = d3.histogram()
        .domain([0, d3.max(filteredData, d => d.price)])
        .thresholds(30)
        .value(d => d.price);

    const bins = histogram(filteredData);

    // Scales
    const xScaleDist = d3.scaleLinear()
        .domain([0, d3.max(filteredData, d => d.price)])
        .range([0, width]);

    const yScaleDist = d3.scaleLinear()
        .domain([0, d3.max(bins, d => d.length)])
        .range([height, 0])
        .nice();

    // Draw bars
    distSvg.selectAll('.bar')
        .data(bins)
        .join('rect')
        .attr('class', 'bar')
        .attr('x', d => xScaleDist(d.x0))
        .attr('y', d => yScaleDist(d.length))
        .attr('width', d => Math.max(0, xScaleDist(d.x1) - xScaleDist(d.x0) - 1))
        .attr('height', d => height - yScaleDist(d.length))
        .attr('fill', '#667eea')
        .attr('opacity', 0.7)
        .style('cursor', 'pointer')
        .on('mouseover', function(event, d) {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('opacity', 1)
                .attr('fill', '#764ba2');
            showDistTooltip(event, d);
        })
        .on('mouseout', function() {
            d3.select(this)
                .transition()
                .duration(200)
                .attr('opacity', 0.7)
                .attr('fill', '#667eea');
            hideTooltip();
        });

    // Axes
    distSvg.append('g')
        .attr('class', 'x-axis axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(xScaleDist).ticks(8).tickFormat(d => ''));

    distSvg.append('g')
        .attr('class', 'y-axis axis')
        .call(d3.axisLeft(yScaleDist).ticks(8));

    // Labels
    distSvg.append('text')
        .attr('class', 'axis-label')
        .attr('x', width / 2)
        .attr('y', height + 45)
        .attr('text-anchor', 'middle')
        .text('Price (USD)');

    distSvg.append('text')
        .attr('class', 'axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('x', -height / 2)
        .attr('y', -55)
        .attr('text-anchor', 'middle')
        .text('Frequency');

    // Title
    distSvg.append('text')
        .attr('x', width / 2)
        .attr('y', -15)
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .style('font-weight', '600')
        .style('fill', '#1e293b')
        .text('Price Distribution');

    // Add median line
    const medianPrice = d3.median(filteredData, d => d.price);
    distSvg.append('line')
        .attr('x1', xScaleDist(medianPrice))
        .attr('x2', xScaleDist(medianPrice))
        .attr('y1', 0)
        .attr('y2', height)
        .attr('stroke', '#dc2626')
        .attr('stroke-width', 2)
        .attr('stroke-dasharray', '5 5');

    distSvg.append('text')
        .attr('x', xScaleDist(medianPrice) + 5)
        .attr('y', 15)
        .style('font-size', '12px')
        .style('font-weight', '600')
        .style('fill', '#dc2626')
        .text(`Median: ${(medianPrice / 1000).toFixed(0)}k`);
}

// Create timeline brush
function createTimeline() {
    const container = d3.select('#timeline');
    const bounds = container.node().getBoundingClientRect();
    const width = bounds.width - timelineMargin.left - timelineMargin.right;
    const height = bounds.height - timelineMargin.top - timelineMargin.bottom;

    container.selectAll('*').remove();

    timelineSvg = container.append('svg')
        .attr('width', bounds.width)
        .attr('height', bounds.height)
        .append('g')
        .attr('transform', `translate(${timelineMargin.left},${timelineMargin.top})`);

    const timelineXScale = d3.scaleTime()
        .domain(d3.extent(timeSeriesData, d => d.date))
        .range([0, width]);

    const metricKey = currentMetric === 'price' ? 'avgPrice' :
        currentMetric === 'price_sqft' ? 'avgPriceSqft' : 'count';

    const timelineYScale = d3.scaleLinear()
        .domain([0, d3.max(timeSeriesData, d => d[metricKey])])
        .range([height, 0]);

    const timelineArea = d3.area()
        .x(d => timelineXScale(d.date))
        .y0(height)
        .y1(d => timelineYScale(d[metricKey]))
        .curve(d3.curveMonotoneX);

    // Draw mini area
    timelineSvg.append('path')
        .datum(timeSeriesData)
        .attr('d', timelineArea)
        .attr('fill', '#667eea')
        .attr('opacity', 0.5);

    // Brush
    brush = d3.brushX()
        .extent([[0, 0], [width, height]])
        .on('brush end', brushed);

    timelineSvg.append('g')
        .attr('class', 'brush')
        .call(brush);

    // Timeline axis
    timelineSvg.append('g')
        .attr('class', 'timeline-axis axis')
        .attr('transform', `translate(0,${height})`)
        .call(d3.axisBottom(timelineXScale).ticks(10));

    // Label
    timelineSvg.append('text')
        .attr('x', width / 2)
        .attr('y', height + 35)
        .attr('text-anchor', 'middle')
        .style('font-size', '12px')
        .style('font-weight', '600')
        .style('fill', '#4a5568')
        .text('Drag to zoom into specific date range');
}

// Brush handler
function brushed(event) {
    if (!event.selection) {
        currentBrushExtent = null;
    } else {
        const [x0, x1] = event.selection.map(d => {
            const timelineXScale = d3.scaleTime()
                .domain(d3.extent(timeSeriesData, d => d.date))
                .range([0, d3.select('#timeline').node().getBoundingClientRect().width - timelineMargin.left - timelineMargin.right]);
            return timelineXScale.invert(d);
        });
        currentBrushExtent = [x0, x1];
    }

    createMainChart();
}

// Tooltip functions
function showMainTooltip(event, d) {
    createTooltip(event, `
        <div class="title">
            📅 ${d3.timeFormat('%B %Y')(d.date)}
        </div>
        <div class="stat">
            <strong>Average Price:</strong>
            <span class="value">${d.avgPrice.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
        </div>
        <div class="stat">
            <strong>Median Price:</strong>
            <span class="value">${d.medianPrice.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
        </div>
        <div class="stat">
            <strong>Price per Sq Ft:</strong>
            <span class="value">${d.avgPriceSqft.toFixed(2)}</span>
        </div>
        <div class="divider"></div>
        <div class="stat">
            <strong>Sales Volume:</strong>
            <span class="value">${d.count.toLocaleString()}</span>
        </div>
    `);
}

function showScatterTooltip(event, d) {
    createTooltip(event, `
        <div class="title">
            🏠 Property Details
        </div>
        <div class="stat">
            <strong>Price:</strong>
            <span class="value">${d.price.toLocaleString()}</span>
        </div>
        <div class="stat">
            <strong>Living Area:</strong>
            <span class="value">${d.sqft_living.toLocaleString()} sq ft</span>
        </div>
        <div class="stat">
            <strong>Price/Sq Ft:</strong>
            <span class="value">${d.price_per_sqft.toFixed(2)}</span>
        </div>
        <div class="divider"></div>
        <div class="stat">
            <strong>Bedrooms:</strong> ${d.bedrooms} | <strong>Bathrooms:</strong> ${d.bathrooms}
        </div>
        <div class="stat">
            <strong>Condition:</strong> ${d.condition}/5 | <strong>Floors:</strong> ${d.floors}
        </div>
        <div class="stat">
            <strong>Built:</strong> ${d.yr_built}
            ${d.yr_renovated > 0 ? ` | <strong>Renovated:</strong> ${d.yr_renovated}` : ''}
        </div>
        ${d.waterfront ? '<div class="stat" style="color: #0891b2;"><strong>✓ Waterfront Property</strong></div>' : ''}
    `);
}

function showDistTooltip(event, d) {
    const avgPrice = (d.x0 + d.x1) / 2;
    createTooltip(event, `
        <div class="title">
            📊 Price Range
        </div>
        <div class="stat">
            <strong>Range:</strong>
            <span class="value">${(d.x0/1000).toFixed(0)}k - ${(d.x1/1000).toFixed(0)}k</span>
        </div>
        <div class="stat">
            <strong>Properties:</strong>
            <span class="value">${d.length.toLocaleString()}</span>
        </div>
        <div class="stat">
            <strong>Percentage:</strong>
            <span class="value">${((d.length / filteredData.length) * 100).toFixed(1)}%</span>
        </div>
    `);
}

function createTooltip(event, html) {
    let tooltip = d3.select('.tooltip');
    if (tooltip.empty()) {
        tooltip = d3.select('body').append('div')
            .attr('class', 'tooltip')
            .style('opacity', 0);
    }

    tooltip.html(html)
        .style('left', (event.pageX + 15) + 'px')
        .style('top', (event.pageY - 15) + 'px')
        .transition()
        .duration(200)
        .style('opacity', 1);
}

function hideTooltip() {
    d3.selectAll('.tooltip')
        .transition()
        .duration(200)
        .style('opacity', 0)
        .remove();
}

// Setup controls
function setupControls() {
    // Metric selector
    d3.select('#metric-select').on('change', function() {
        currentMetric = this.value;
        createMainChart();
        createTimeline();
    });

    // Apply filters button
    d3.select('#apply-filter-btn').on('click', () => {
        currentFilters.bedrooms = d3.select('#bedroom-filter').property('value');
        currentFilters.waterfront = d3.select('#waterfront-filter').property('value');
        currentFilters.condition = d3.select('#condition-filter').property('value');

        const sqftMin = d3.select('#sqft-min').property('value');
        const sqftMax = d3.select('#sqft-max').property('value');
        currentFilters.sqftMin = sqftMin ? +sqftMin : null;
        currentFilters.sqftMax = sqftMax ? +sqftMax : null;

        applyFilters();
        initVisualization();
    });

    // Reset filters
    d3.select('#reset-filter-btn').on('click', () => {
        currentFilters = {
            bedrooms: 'all',
            waterfront: 'all',
            condition: 'all',
            sqftMin: null,
            sqftMax: null
        };

        d3.select('#bedroom-filter').property('value', 'all');
        d3.select('#waterfront-filter').property('value', 'all');
        d3.select('#condition-filter').property('value', 'all');
        d3.select('#sqft-min').property('value', '');
        d3.select('#sqft-max').property('value', '');

        applyFilters();
        initVisualization();
    });
}

// Update active filter badges
function updateActiveBadges() {
    const container = d3.select('#active-filters');
    container.selectAll('*').remove();

    const badges = [];

    if (currentFilters.bedrooms !== 'all') {
        badges.push({ label: 'Bedrooms', value: currentFilters.bedrooms });
    }
    if (currentFilters.waterfront !== 'all') {
        badges.push({ label: 'Waterfront', value: currentFilters.waterfront === '1' ? 'Yes' : 'No' });
    }
    if (currentFilters.condition !== 'all') {
        badges.push({ label: 'Condition', value: currentFilters.condition });
    }
    if (currentFilters.sqftMin) {
        badges.push({ label: 'Min Sq Ft', value: currentFilters.sqftMin.toLocaleString() });
    }
    if (currentFilters.sqftMax) {
        badges.push({ label: 'Max Sq Ft', value: currentFilters.sqftMax.toLocaleString() });
    }

    badges.push({ label: 'Total Properties', value: filteredData.length.toLocaleString() });

    badges.forEach(badge => {
        const div = container.append('div')
            .attr('class', 'filter-badge');

        div.append('span')
            .attr('class', 'label')
            .text(badge.label + ':');

        div.append('span')
            .attr('class', 'value')
            .text(badge.value);
    });
}

// Initialize
loadData();